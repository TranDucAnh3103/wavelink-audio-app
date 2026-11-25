package external

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"audio-app-backend/config"
)

var validVideoIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{6,20}$`)

// AudioStreamInfo holds the resolved direct CDN audio stream metadata for a YouTube video.
type AudioStreamInfo struct {
	VideoID          string
	URL              string
	MIME             string
	ContentLength    int64
	ApproxDurationMs int64
	Itag             int
	Bitrate          int
	ExpiresAt        time.Time
	Source           string
}

// StreamExtractor extracts a playable direct audio stream URL from a YouTube video ID.
type StreamExtractor interface {
	Extract(ctx context.Context, videoID string) (*AudioStreamInfo, error)
}

// ValidateVideoID ensures the video ID matches YouTube's safe character set to prevent CLI or path injection.
func ValidateVideoID(videoID string) bool {
	return validVideoIDPattern.MatchString(strings.TrimSpace(videoID))
}

// ParseClenFromURL reads the byte content length from googlevideo's `clen` query parameter.
func ParseClenFromURL(rawURL string) int64 {
	u, err := url.Parse(rawURL)
	if err != nil {
		return 0
	}
	clenStr := u.Query().Get("clen")
	if clenStr == "" {
		return 0
	}
	val, err := strconv.ParseInt(clenStr, 10, 64)
	if err != nil || val < 0 {
		return 0
	}
	return val
}

// ParseExpireFromURL reads the expiration unix timestamp from googlevideo's `expire` query parameter.
func ParseExpireFromURL(rawURL string) time.Time {
	u, err := url.Parse(rawURL)
	if err != nil {
		return time.Time{}
	}
	expStr := u.Query().Get("expire")
	if expStr == "" {
		return time.Time{}
	}
	sec, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || sec <= 0 {
		return time.Time{}
	}
	return time.Unix(sec, 0).UTC()
}

// NormalizeAudioMIME maps raw mimeType or file extension into a browser-compatible Content-Type.
func NormalizeAudioMIME(rawMIME, ext string) string {
	lower := strings.ToLower(strings.TrimSpace(rawMIME))
	if idx := strings.Index(lower, ";"); idx != -1 {
		lower = strings.TrimSpace(lower[:idx])
	}
	if strings.HasPrefix(lower, "audio/") {
		if lower == "audio/m4a" || lower == "audio/x-m4a" {
			return "audio/mp4"
		}
		return lower
	}

	switch strings.ToLower(strings.TrimSpace(ext)) {
	case "m4a", "mp4", "aac":
		return "audio/mp4"
	case "webm":
		return "audio/webm"
	case "opus", "ogg":
		return "audio/ogg"
	case "mp3":
		return "audio/mpeg"
	default:
		return "audio/mp4"
	}
}

func computeEffectiveExpiry(rawURL string, ttl time.Duration) time.Time {
	if ttl <= 0 {
		ttl = 210 * time.Minute
	}
	now := time.Now().UTC()
	exp := now.Add(ttl)
	if urlExp := ParseExpireFromURL(rawURL); !urlExp.IsZero() {
		safeURL := urlExp.Add(-15 * time.Minute)
		if safeURL.Before(exp) {
			exp = safeURL
		}
	}
	if !exp.After(now) {
		return now.Add(5 * time.Minute)
	}
	return exp
}

// YtDlpExtractor uses the yt-dlp CLI binary with bounded concurrency to extract direct audio URLs.
type YtDlpExtractor struct {
	Path        string
	CookiesFile string
	Format      string
	Timeout     time.Duration
	URLTTL      time.Duration
	sem         chan struct{}
}

// NewYtDlpExtractor builds a YtDlpExtractor with concurrency semaphore.
func NewYtDlpExtractor(path, cookiesFile, format string, maxConcurrent int, urlTTL time.Duration) *YtDlpExtractor {
	if strings.TrimSpace(path) == "" {
		path = "yt-dlp"
	}
	if strings.TrimSpace(format) == "" {
		format = "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio"
	}
	if maxConcurrent <= 0 {
		maxConcurrent = 2
	}
	if urlTTL <= 0 {
		urlTTL = 210 * time.Minute
	}
	return &YtDlpExtractor{
		Path:        path,
		CookiesFile: strings.TrimSpace(cookiesFile),
		Format:      format,
		Timeout:     25 * time.Second,
		URLTTL:      urlTTL,
		sem:         make(chan struct{}, maxConcurrent),
	}
}

func (e *YtDlpExtractor) IsAvailable() bool {
	_, err := exec.LookPath(e.Path)
	return err == nil
}

type ytDlpJSON struct {
	URL            string  `json:"url"`
	Ext            string  `json:"ext"`
	Filesize       int64   `json:"filesize"`
	FilesizeApprox int64   `json:"filesize_approx"`
	Duration       float64 `json:"duration"`
	FormatID       string  `json:"format_id"`
	ABR            float64 `json:"abr"`
}

func (e *YtDlpExtractor) Extract(ctx context.Context, videoID string) (*AudioStreamInfo, error) {
	trimmed := strings.TrimSpace(videoID)
	if !ValidateVideoID(trimmed) {
		return nil, fmt.Errorf("invalid video ID: %q", videoID)
	}
	if !e.IsAvailable() {
		return nil, fmt.Errorf("yt-dlp binary not found at %q", e.Path)
	}

	select {
	case e.sem <- struct{}{}:
		defer func() { <-e.sem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	cmdCtx, cancel := context.WithTimeout(ctx, e.Timeout)
	defer cancel()

	args := []string{
		"--no-playlist",
		"--no-warnings",
		"--no-check-certificates",
		"-j",
		"-f", e.Format,
	}
	if e.CookiesFile != "" {
		if _, err := os.Stat(e.CookiesFile); err == nil {
			args = append(args, "--cookies", e.CookiesFile)
		}
	}
	args = append(args, "--", "https://www.youtube.com/watch?v="+trimmed)

	cmd := exec.CommandContext(cmdCtx, e.Path, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return nil, fmt.Errorf("yt-dlp failed: %s", errMsg)
	}

	var parsed ytDlpJSON
	if err := json.Unmarshal(stdout.Bytes(), &parsed); err != nil {
		return nil, fmt.Errorf("yt-dlp invalid JSON: %w", err)
	}
	if strings.TrimSpace(parsed.URL) == "" {
		return nil, errors.New("yt-dlp returned empty stream URL")
	}

	contentLen := parsed.Filesize
	if contentLen <= 0 {
		contentLen = parsed.FilesizeApprox
	}
	if contentLen <= 0 {
		contentLen = ParseClenFromURL(parsed.URL)
	}
	itag, _ := strconv.Atoi(parsed.FormatID)

	return &AudioStreamInfo{
		VideoID:          trimmed,
		URL:              parsed.URL,
		MIME:             NormalizeAudioMIME("", parsed.Ext),
		ContentLength:    contentLen,
		ApproxDurationMs: int64(parsed.Duration * 1000),
		Itag:             itag,
		Bitrate:          int(parsed.ABR * 1000),
		ExpiresAt:        computeEffectiveExpiry(parsed.URL, e.URLTTL),
		Source:           "yt-dlp",
	}, nil
}

// InnertubeStreamExtractor extracts direct audio stream URLs via YouTube Innertube player API.
type InnertubeStreamExtractor struct {
	Client   *http.Client
	URLTTL   time.Duration
	Endpoint string
}

// NewInnertubeStreamExtractor creates an Innertube fallback extractor.
func NewInnertubeStreamExtractor(urlTTL time.Duration) *InnertubeStreamExtractor {
	if urlTTL <= 0 {
		urlTTL = 210 * time.Minute
	}
	return &InnertubeStreamExtractor{
		Client:   &http.Client{Timeout: 8 * time.Second},
		URLTTL:   urlTTL,
		Endpoint: "https://www.youtube.com/youtubei/v1/player",
	}
}

type innertubeStreamingResp struct {
	PlayabilityStatus struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	} `json:"playabilityStatus"`
	StreamingData struct {
		ExpiresInSeconds string `json:"expiresInSeconds"`
		AdaptiveFormats  []struct {
			Itag             int    `json:"itag"`
			URL              string `json:"url"`
			MimeType         string `json:"mimeType"`
			Bitrate          int    `json:"bitrate"`
			ContentLength    string `json:"contentLength"`
			ApproxDurationMs string `json:"approxDurationMs"`
			AudioQuality     string `json:"audioQuality"`
		} `json:"adaptiveFormats"`
	} `json:"streamingData"`
}

func (e *InnertubeStreamExtractor) Extract(ctx context.Context, videoID string) (*AudioStreamInfo, error) {
	trimmed := strings.TrimSpace(videoID)
	if !ValidateVideoID(trimmed) {
		return nil, fmt.Errorf("invalid video ID: %q", videoID)
	}

	profiles := []struct {
		clientName    string
		clientVersion string
		androidSDKVer int
		userAgent     string
	}{
		{
			clientName:    "ANDROID",
			clientVersion: "19.29.37",
			androidSDKVer: 34,
			userAgent:     "com.google.android.youtube/19.29.37 (Linux; U; Android 14) gzip",
		},
		{
			clientName:    "IOS",
			clientVersion: "19.29.1",
			userAgent:     "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)",
		},
		{
			clientName:    "TVHTML5",
			clientVersion: "7.20240724.13.00",
			userAgent:     "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1",
		},
		{
			clientName:    "MWEB",
			clientVersion: "2.20240726.01.00",
			userAgent:     "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		},
	}

	endpoint := e.Endpoint
	if endpoint == "" {
		endpoint = "https://www.youtube.com/youtubei/v1/player"
	}

	var lastErr error
	for _, p := range profiles {
		payload := innertubeClientPayload{VideoID: trimmed}
		payload.Context.Client.ClientName = p.clientName
		payload.Context.Client.ClientVersion = p.clientVersion
		payload.Context.Client.AndroidSdkVersion = p.androidSDKVer
		payload.Context.Client.Hl = "vi"
		payload.Context.Client.Gl = "VN"

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			lastErr = err
			continue
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", p.userAgent)

		resp, err := e.Client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("innertube %s HTTP %d", p.clientName, resp.StatusCode)
			_ = resp.Body.Close()
			continue
		}

		var data innertubeStreamingResp
		err = json.NewDecoder(resp.Body).Decode(&data)
		_ = resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}

		if data.PlayabilityStatus.Status != "" && data.PlayabilityStatus.Status != "OK" {
			lastErr = fmt.Errorf("innertube %s playability=%s (%s)", p.clientName, data.PlayabilityStatus.Status, data.PlayabilityStatus.Reason)
			continue
		}

		var bestMP4 *AudioStreamInfo
		var bestAny *AudioStreamInfo
		for _, f := range data.StreamingData.AdaptiveFormats {
			if strings.TrimSpace(f.URL) == "" || !strings.HasPrefix(strings.ToLower(f.MimeType), "audio/") {
				continue
			}
			clen, _ := strconv.ParseInt(f.ContentLength, 10, 64)
			if clen <= 0 {
				clen = ParseClenFromURL(f.URL)
			}
			durMs, _ := strconv.ParseInt(f.ApproxDurationMs, 10, 64)
			mime := NormalizeAudioMIME(f.MimeType, "")

			candidate := &AudioStreamInfo{
				VideoID:          trimmed,
				URL:              f.URL,
				MIME:             mime,
				ContentLength:    clen,
				ApproxDurationMs: durMs,
				Itag:             f.Itag,
				Bitrate:          f.Bitrate,
				ExpiresAt:        computeEffectiveExpiry(f.URL, e.URLTTL),
				Source:           "innertube:" + p.clientName,
			}

			if mime == "audio/mp4" {
				// Prefer itag 140 (~128kbps AAC) or highest bitrate mp4 audio
				if bestMP4 == nil || f.Itag == 140 || (bestMP4.Itag != 140 && f.Bitrate > bestMP4.Bitrate) {
					bestMP4 = candidate
				}
			}
			if bestAny == nil || f.Bitrate > bestAny.Bitrate {
				bestAny = candidate
			}
		}

		if bestMP4 != nil {
			return bestMP4, nil
		}
		if bestAny != nil {
			return bestAny, nil
		}
		lastErr = fmt.Errorf("innertube %s: no direct audio formats available", p.clientName)
	}

	if lastErr == nil {
		lastErr = errors.New("innertube failed to extract audio stream")
	}
	return nil, lastErr
}

// MultiExtractor tries multiple StreamExtractor implementations in priority order.
type MultiExtractor struct {
	Extractors []StreamExtractor
}

func (m *MultiExtractor) Extract(ctx context.Context, videoID string) (*AudioStreamInfo, error) {
	var errs []string
	for _, ex := range m.Extractors {
		if ex == nil {
			continue
		}
		info, err := ex.Extract(ctx, videoID)
		if err == nil && info != nil && info.URL != "" {
			return info, nil
		}
		if err != nil {
			errs = append(errs, err.Error())
		}
	}
	if len(errs) == 0 {
		return nil, errors.New("no stream extractors configured")
	}
	return nil, fmt.Errorf("all extractors failed: %s", strings.Join(errs, "; "))
}

// NewDefaultStreamExtractor builds the standard yt-dlp primary + Innertube fallback extractor from Config.
func NewDefaultStreamExtractor(cfg *config.Config) StreamExtractor {
	ttl := time.Duration(cfg.StreamURLTTLMinutes) * time.Minute
	if ttl <= 0 {
		ttl = 210 * time.Minute
	}
	return &MultiExtractor{
		Extractors: []StreamExtractor{
			NewYtDlpExtractor(cfg.YtDlpPath, cfg.YtDlpCookiesFile, cfg.StreamAudioFormat, cfg.StreamMaxConcurrentExtract, ttl),
			NewInnertubeStreamExtractor(ttl),
		},
	}
}
