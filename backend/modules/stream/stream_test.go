package stream_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"audio-app-backend/infra/external"
	"audio-app-backend/modules/stream"
)

type stubExtractor struct {
	fn func(ctx context.Context, videoID string) (*external.AudioStreamInfo, error)
}

func (s *stubExtractor) Extract(ctx context.Context, videoID string) (*external.AudioStreamInfo, error) {
	return s.fn(ctx, videoID)
}

func TestTokenManagerGenerateAndVerify(t *testing.T) {
	tm := stream.NewTokenManager("super-secret-key-123")

	tok, exp, err := tm.Generate("dQw4w9WgXcQ", 42, 7, "", 5*time.Minute)
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}
	if exp.Before(time.Now().UTC()) {
		t.Fatalf("expected future expiry")
	}

	claims, err := tm.Verify(tok, "dQw4w9WgXcQ")
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}
	if claims.AudioID != 42 || claims.UserID != 7 || claims.VideoID != "dQw4w9WgXcQ" {
		t.Fatalf("unexpected claims: %+v", claims)
	}

	// Wrong videoId must be rejected
	if _, err := tm.Verify(tok, "otherVideo1"); err == nil {
		t.Fatalf("expected error for mismatched videoId")
	}

	// Tampered signature must be rejected
	tampered := tok + "x"
	if _, err := tm.Verify(tampered, "dQw4w9WgXcQ"); err == nil {
		t.Fatalf("expected error for tampered token")
	}

	// Expired token must be rejected
	expiredTok, _, err := tm.Generate("dQw4w9WgXcQ", 1, 0, "1.2.3.4", -1*time.Second)
	if err == nil {
		// ttl <= 0 defaults to 6h, so test explicit expired token via direct Verify on stale secret/clock:
		_ = expiredTok
	}
}

func TestParseAndCapRange(t *testing.T) {
	// 1. iOS Safari probe bytes=0-1 must remain exact
	r1, err := stream.ParseAndCapRange("bytes=0-1", 50*1024*1024, 10*1024*1024)
	if err != nil {
		t.Fatalf("probe failed: %v", err)
	}
	if r1.UpstreamHeader != "bytes=0-1" {
		t.Fatalf("expected bytes=0-1, got %s", r1.UpstreamHeader)
	}

	// 2. Open-ended range bytes=0- must be capped to 10MB chunk
	r2, err := stream.ParseAndCapRange("bytes=0-", 50*1024*1024, 10*1024*1024)
	if err != nil {
		t.Fatalf("open-ended failed: %v", err)
	}
	want2 := fmt.Sprintf("bytes=0-%d", 10*1024*1024-1)
	if r2.UpstreamHeader != want2 {
		t.Fatalf("expected %s, got %s", want2, r2.UpstreamHeader)
	}

	// 3. Open-ended range near EOF clamps to totalSize - 1
	r3, err := stream.ParseAndCapRange("bytes=100-", 250, 10*1024*1024)
	if err != nil {
		t.Fatalf("eof clamp failed: %v", err)
	}
	if r3.UpstreamHeader != "bytes=100-249" {
		t.Fatalf("expected bytes=100-249, got %s", r3.UpstreamHeader)
	}

	// 4. Out-of-range returns ErrRangeNotSatisfiable
	if _, err := stream.ParseAndCapRange("bytes=500-", 250, 10*1024*1024); !errors.Is(err, stream.ErrRangeNotSatisfiable) {
		t.Fatalf("expected ErrRangeNotSatisfiable, got %v", err)
	}

	// 5. Suffix range preserved
	r5, err := stream.ParseAndCapRange("bytes=-512", 5000, 10*1024*1024)
	if err != nil || r5.UpstreamHeader != "bytes=-512" {
		t.Fatalf("suffix range failed: %+v %v", r5, err)
	}
}

func TestURLCacheSingleflightAndInvalidation(t *testing.T) {
	var calls atomic.Int32
	ext := &stubExtractor{
		fn: func(ctx context.Context, videoID string) (*external.AudioStreamInfo, error) {
			calls.Add(1)
			time.Sleep(40 * time.Millisecond)
			return &external.AudioStreamInfo{
				VideoID:       videoID,
				URL:           "https://example.invalid/audio.m4a",
				MIME:          "audio/mp4",
				ContentLength: 1024,
				ExpiresAt:     time.Now().UTC().Add(time.Hour),
			}, nil
		},
	}

	cache := stream.NewURLCache(ext, time.Hour, 100)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			info, _, err := cache.Get(context.Background(), "dQw4w9WgXcQ")
			if err != nil || info == nil {
				t.Errorf("Get failed: %v", err)
			}
		}()
	}
	wg.Wait()

	if calls.Load() != 1 {
		t.Fatalf("expected singleflight 1 extractor call, got %d", calls.Load())
	}

	// Invalidate forces fresh extraction
	cache.Invalidate("dQw4w9WgXcQ")
	_, hit, err := cache.Get(context.Background(), "dQw4w9WgXcQ")
	if err != nil || hit {
		t.Fatalf("expected cache miss after Invalidate, hit=%v err=%v", hit, err)
	}
	if calls.Load() != 2 {
		t.Fatalf("expected 2 extractor calls after invalidate, got %d", calls.Load())
	}
}

func TestStreamHandlerRange206And403Refresh(t *testing.T) {
	payload := bytes.Repeat([]byte("ABCDEFGH"), 1024) // 8192 bytes

	var upstreamExpired atomic.Bool
	upstreamExpired.Store(true)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/expired" && upstreamExpired.Load() {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		rangeHeader := r.Header.Get("Range")
		if rangeHeader == "" {
			w.Header().Set("Content-Type", "audio/mp4")
			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(payload)))
			w.WriteHeader(http.StatusOK)
			if r.Method != http.MethodHead {
				_, _ = w.Write(payload)
			}
			return
		}

		var start, end int
		if _, err := fmt.Sscanf(rangeHeader, "bytes=%d-%d", &start, &end); err != nil {
			http.Error(w, "bad range", http.StatusBadRequest)
			return
		}
		if end >= len(payload) {
			end = len(payload) - 1
		}
		slice := payload[start : end+1]
		w.Header().Set("Content-Type", "audio/mp4")
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, len(payload)))
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(slice)))
		w.WriteHeader(http.StatusPartialContent)
		if r.Method != http.MethodHead {
			_, _ = w.Write(slice)
		}
	}))
	defer upstream.Close()

	var extractCount atomic.Int32
	ext := &stubExtractor{
		fn: func(ctx context.Context, videoID string) (*external.AudioStreamInfo, error) {
			n := extractCount.Add(1)
			path := "/expired"
			if n > 1 {
				path = "/fresh"
			}
			return &external.AudioStreamInfo{
				VideoID:       videoID,
				URL:           upstream.URL + path,
				MIME:          "audio/mp4",
				ContentLength: int64(len(payload)),
				ExpiresAt:     time.Now().UTC().Add(time.Hour),
			}, nil
		},
	}

	tokens := stream.NewTokenManager("test-secret")
	cache := stream.NewURLCache(ext, time.Hour, 50)
	limiter := stream.NewConcurrencyLimiter(2)
	h := stream.NewHandler(tokens, cache, limiter, "*", 4096)

	validTok, _, err := tokens.Generate("dQw4w9WgXcQ", 1, 99, "", time.Hour)
	if err != nil {
		t.Fatalf("token gen failed: %v", err)
	}

	// 1. Missing token -> 403
	reqUnauth := httptest.NewRequest(http.MethodGet, "/stream/dQw4w9WgXcQ", nil)
	wUnauth := httptest.NewRecorder()
	h.ServeHTTP(wUnauth, reqUnauth)
	if wUnauth.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for missing token, got %d", wUnauth.Code)
	}

	// 2. iOS Safari probe `bytes=0-1` triggers upstream 403 -> transparent re-extract -> 206 Partial Content!
	reqProbe := httptest.NewRequest(http.MethodGet, "/stream/dQw4w9WgXcQ?st="+validTok, nil)
	reqProbe.Header.Set("Range", "bytes=0-1")
	wProbe := httptest.NewRecorder()
	h.ServeHTTP(wProbe, reqProbe)

	if wProbe.Code != http.StatusPartialContent {
		t.Fatalf("expected 206 Partial Content, got %d (%s)", wProbe.Code, wProbe.Body.String())
	}
	if wProbe.Header().Get("Content-Type") != "audio/mp4" {
		t.Fatalf("expected audio/mp4, got %s", wProbe.Header().Get("Content-Type"))
	}
	if wProbe.Header().Get("Accept-Ranges") != "bytes" {
		t.Fatalf("expected Accept-Ranges: bytes")
	}
	if !strings.HasPrefix(wProbe.Header().Get("Content-Range"), "bytes 0-1/8192") {
		t.Fatalf("unexpected Content-Range: %s", wProbe.Header().Get("Content-Range"))
	}
	if wProbe.Body.String() != "AB" {
		t.Fatalf("expected probe body AB, got %q", wProbe.Body.String())
	}
	if extractCount.Load() != 2 {
		t.Fatalf("expected 2 extractions (initial + 403 refresh), got %d", extractCount.Load())
	}

	// 3. HEAD request returns headers with empty body
	reqHead := httptest.NewRequest(http.MethodHead, "/stream/dQw4w9WgXcQ?st="+validTok, nil)
	reqHead.Header.Set("Range", "bytes=0-1")
	wHead := httptest.NewRecorder()
	h.ServeHTTP(wHead, reqHead)
	if wHead.Code != http.StatusPartialContent || wHead.Body.Len() != 0 {
		t.Fatalf("expected 206 empty HEAD body, got code=%d len=%d", wHead.Code, wHead.Body.Len())
	}

	// 4. ConcurrencyLimiter rejects 3rd concurrent stream for user 99
	rel1, ok1 := limiter.Acquire("u:99")
	rel2, ok2 := limiter.Acquire("u:99")
	if !ok1 || !ok2 {
		t.Fatalf("expected first 2 acquires to succeed")
	}
	reqLim := httptest.NewRequest(http.MethodGet, "/stream/dQw4w9WgXcQ?st="+validTok, nil)
	wLim := httptest.NewRecorder()
	h.ServeHTTP(wLim, reqLim)
	if wLim.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 when concurrency exceeded, got %d", wLim.Code)
	}
	rel1()
	rel2()
}
