package stream

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"audio-app-backend/infra/external"
	"audio-app-backend/server/middleware"
)

const defaultUpstreamUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

// Handler streams YouTube audio bytes directly via HTTP Range requests without disk storage or transcoding.
type Handler struct {
	tokens         *TokenManager
	cache          *URLCache
	limiter        *ConcurrencyLimiter
	allowedOrigins string
	maxChunkBytes  int64
	upstreamClient *http.Client
	stats          *Stats
}

// NewHandler constructs a production-ready stream proxy Handler.
func NewHandler(
	tokens *TokenManager,
	cache *URLCache,
	limiter *ConcurrencyLimiter,
	allowedOrigins string,
	maxChunkBytes int64,
) *Handler {
	if maxChunkBytes <= 0 {
		maxChunkBytes = 10 * 1024 * 1024
	}
	transport := &http.Transport{
		ResponseHeaderTimeout: 15 * time.Second,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   32,
		IdleConnTimeout:       90 * time.Second,
	}
	return &Handler{
		tokens:         tokens,
		cache:          cache,
		limiter:        limiter,
		allowedOrigins: allowedOrigins,
		maxChunkBytes:  maxChunkBytes,
		upstreamClient: &http.Client{
			Timeout:   0, // Never impose a total request timeout on long audio streams
			Transport: transport,
		},
		stats: &Stats{},
	}
}

// SetUpstreamClient allows injecting a custom HTTP client (e.g., in tests).
func (h *Handler) SetUpstreamClient(client *http.Client) {
	if client != nil {
		h.upstreamClient = client
	}
}

// Stats returns live atomic stream metrics.
func (h *Handler) Stats() *Stats {
	return h.stats
}

// HealthHandler reports stream proxy readiness and metrics.
func (h *Handler) HealthHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		h.writeCORSHeaders(w, r)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":       "healthy",
			"cachedUrls":   h.cache.Len(),
			"streamStats":  h.stats.Snapshot(),
			"timestampUtc": time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func (h *Handler) writeCORSHeaders(w http.ResponseWriter, r *http.Request) {
	reqOrigin := r.Header.Get("Origin")
	allowed, allowAll := middleware.IsOriginAllowed(reqOrigin, h.allowedOrigins)
	hd := w.Header()
	if allowAll {
		hd.Set("Access-Control-Allow-Origin", "*")
	} else if allowed && reqOrigin != "" {
		hd.Set("Access-Control-Allow-Origin", reqOrigin)
		hd.Set("Access-Control-Allow-Credentials", "true")
		hd.Set("Vary", "Origin")
	}
	hd.Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	hd.Set("Access-Control-Allow-Headers", "Range, Content-Type, Authorization, Origin, Accept")
	hd.Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Content-Type")
	hd.Set("Access-Control-Max-Age", "86400")
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.writeCORSHeaders(w, r)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	videoID := strings.TrimPrefix(r.URL.Path, "/stream/")
	videoID = strings.Trim(videoID, "/")
	if !external.ValidateVideoID(videoID) {
		http.Error(w, "invalid video id", http.StatusBadRequest)
		return
	}

	claims, err := h.tokens.Verify(r.URL.Query().Get("st"), videoID)
	if err != nil {
		http.Error(w, "forbidden: "+err.Error(), http.StatusForbidden)
		return
	}

	release, ok := h.limiter.Acquire(claims.SubjectKey())
	if !ok {
		http.Error(w, "too many concurrent streams", http.StatusTooManyRequests)
		return
	}
	defer release()

	// Defense-in-depth: clear any server write deadline for long-lived audio transfers.
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	h.stats.TotalRequests.Add(1)
	h.stats.ActiveStreams.Add(1)
	defer h.stats.ActiveStreams.Add(-1)

	started := time.Now()
	info, cacheHit, err := h.cache.Get(r.Context(), videoID)
	if err != nil {
		h.stats.ExtractErrors.Add(1)
		slog.Warn("stream extract failed", "videoId", videoID, "error", err)
		http.Error(w, "failed to resolve audio stream", http.StatusBadGateway)
		return
	}
	if cacheHit {
		h.stats.CacheHits.Add(1)
	} else {
		h.stats.CacheMisses.Add(1)
	}

	rawRange := r.Header.Get("Range")
	rangeSpec, err := ParseAndCapRange(rawRange, info.ContentLength, h.maxChunkBytes)
	if err != nil {
		if errors.Is(err, ErrRangeNotSatisfiable) {
			if info.ContentLength > 0 {
				w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", info.ContentLength))
			}
			http.Error(w, "range not satisfiable", http.StatusRequestedRangeNotSatisfiable)
			return
		}
		http.Error(w, "invalid range header", http.StatusBadRequest)
		return
	}

	resp, err := h.doUpstream(r.Context(), r.Method, info.URL, rangeSpec.UpstreamHeader)
	if err == nil && (resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusGone) {
		_ = resp.Body.Close()
		h.stats.Upstream403Count.Add(1)
		h.cache.Invalidate(videoID)

		info, _, err = h.cache.Get(r.Context(), videoID)
		if err != nil {
			h.stats.ExtractErrors.Add(1)
			slog.Warn("stream re-extract after upstream 403/410 failed", "videoId", videoID, "error", err)
			http.Error(w, "stream URL expired and refresh failed", http.StatusBadGateway)
			return
		}
		rangeSpec, err = ParseAndCapRange(rawRange, info.ContentLength, h.maxChunkBytes)
		if err != nil {
			http.Error(w, "invalid range after refresh", http.StatusBadRequest)
			return
		}
		resp, err = h.doUpstream(r.Context(), r.Method, info.URL, rangeSpec.UpstreamHeader)
	}

	if err != nil {
		if !errors.Is(err, context.Canceled) {
			slog.Warn("stream upstream request error", "videoId", videoID, "error", err)
			http.Error(w, "upstream stream error", http.StatusBadGateway)
		}
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		slog.Warn("stream upstream status error", "videoId", videoID, "status", resp.StatusCode)
		http.Error(w, "upstream rejected stream", http.StatusBadGateway)
		return
	}

	hd := w.Header()
	mime := info.MIME
	if mime == "" {
		mime = "audio/mp4"
	}
	hd.Set("Content-Type", mime)
	hd.Set("Accept-Ranges", "bytes")
	hd.Set("Cache-Control", "private, no-store")
	hd.Set("X-Content-Type-Options", "nosniff")

	if cl := resp.Header.Get("Content-Length"); cl != "" {
		hd.Set("Content-Length", cl)
	} else if r.Method == http.MethodHead && info.ContentLength > 0 {
		hd.Set("Content-Length", strconv.FormatInt(info.ContentLength, 10))
	}
	if cr := resp.Header.Get("Content-Range"); cr != "" {
		hd.Set("Content-Range", cr)
	}

	w.WriteHeader(resp.StatusCode)

	if r.Method == http.MethodHead {
		return
	}

	buf := make([]byte, 64*1024)
	written, copyErr := io.CopyBuffer(w, resp.Body, buf)
	h.stats.BytesStreamed.Add(written)

	if copyErr != nil && !errors.Is(copyErr, context.Canceled) && !errors.Is(r.Context().Err(), context.Canceled) {
		slog.Debug("stream transfer ended with error",
			"videoId", videoID,
			"bytes", written,
			"durationMs", time.Since(started).Milliseconds(),
			"error", copyErr,
		)
	}
}

func (h *Handler) doUpstream(ctx context.Context, method, upstreamURL, rangeHeader string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, upstreamURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", defaultUpstreamUserAgent)
	if rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	return h.upstreamClient.Do(req)
}
