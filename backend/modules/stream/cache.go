package stream

import (
	"context"
	"sync"
	"time"

	"audio-app-backend/infra/external"
)

type inflightCall struct {
	wg   sync.WaitGroup
	info *external.AudioStreamInfo
	err  error
}

// URLCache caches resolved direct YouTube audio URLs in RAM with singleflight deduplication.
type URLCache struct {
	extractor  external.StreamExtractor
	defaultTTL time.Duration
	maxEntries int

	mu       sync.Mutex
	entries  map[string]*external.AudioStreamInfo
	inflight map[string]*inflightCall
}

func NewURLCache(extractor external.StreamExtractor, defaultTTL time.Duration, maxEntries int) *URLCache {
	if defaultTTL <= 0 {
		defaultTTL = 210 * time.Minute
	}
	if maxEntries <= 0 {
		maxEntries = 500
	}
	return &URLCache{
		extractor:  extractor,
		defaultTTL: defaultTTL,
		maxEntries: maxEntries,
		entries:    make(map[string]*external.AudioStreamInfo),
		inflight:   make(map[string]*inflightCall),
	}
}

// Get returns a valid cached AudioStreamInfo or extracts one using singleflight coalescing.
func (c *URLCache) Get(ctx context.Context, videoID string) (*external.AudioStreamInfo, bool, error) {
	now := time.Now().UTC()

	c.mu.Lock()
	if cached, ok := c.entries[videoID]; ok && cached != nil && now.Before(cached.ExpiresAt) {
		c.mu.Unlock()
		return cached, true, nil
	}

	if call, waiting := c.inflight[videoID]; waiting {
		c.mu.Unlock()
		call.wg.Wait()
		if call.err != nil {
			return nil, false, call.err
		}
		return call.info, true, nil
	}

	call := &inflightCall{}
	call.wg.Add(1)
	c.inflight[videoID] = call
	c.mu.Unlock()

	// Run extraction on a detached timeout context so one cancelled seek request doesn't abort shared work.
	extractCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	info, err := c.extractor.Extract(extractCtx, videoID)
	cancel()

	if err == nil && info != nil {
		if info.ExpiresAt.IsZero() {
			info.ExpiresAt = time.Now().UTC().Add(c.defaultTTL)
		}
		if info.MIME == "" {
			info.MIME = "audio/mp4"
		}
	}

	c.mu.Lock()
	delete(c.inflight, videoID)
	if err == nil && info != nil {
		c.evictIfNeededLocked()
		c.entries[videoID] = info
	}
	c.mu.Unlock()

	call.info = info
	call.err = err
	call.wg.Done()

	if err != nil {
		return nil, false, err
	}
	return info, false, nil
}

// Invalidate removes a cached video entry (e.g. after upstream 403/410).
func (c *URLCache) Invalidate(videoID string) {
	c.mu.Lock()
	delete(c.entries, videoID)
	c.mu.Unlock()
}

// Warm triggers a non-blocking background extraction if not already cached or in flight.
func (c *URLCache) Warm(videoID string) {
	if c.extractor == nil || !external.ValidateVideoID(videoID) {
		return
	}
	now := time.Now().UTC()
	c.mu.Lock()
	if cached, ok := c.entries[videoID]; ok && cached != nil && now.Before(cached.ExpiresAt) {
		c.mu.Unlock()
		return
	}
	if _, waiting := c.inflight[videoID]; waiting {
		c.mu.Unlock()
		return
	}
	c.mu.Unlock()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()
		_, _, _ = c.Get(ctx, videoID)
	}()
}

func (c *URLCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

func (c *URLCache) evictIfNeededLocked() {
	now := time.Now().UTC()
	for k, v := range c.entries {
		if v == nil || !now.Before(v.ExpiresAt) {
			delete(c.entries, k)
		}
	}
	if len(c.entries) < c.maxEntries {
		return
	}
	var oldestKey string
	var oldestExp time.Time
	for k, v := range c.entries {
		if oldestKey == "" || v.ExpiresAt.Before(oldestExp) {
			oldestKey = k
			oldestExp = v.ExpiresAt
		}
	}
	if oldestKey != "" {
		delete(c.entries, oldestKey)
	}
}
