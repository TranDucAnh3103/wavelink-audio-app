package middleware_test

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"audio-app-backend/server/middleware"

	"github.com/gin-gonic/gin"
)

func TestGzipAndETagMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.Gzip())
	r.Use(middleware.ETag())

	r.GET("/api/v1/categories", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
		c.JSON(http.StatusOK, gin.H{"message": strings.Repeat("wavelink-", 40)})
	})

	r.GET("/stream/abc123", func(c *gin.Context) {
		c.Data(http.StatusOK, "audio/mp4", []byte("raw-audio-stream-bytes"))
	})

	// 1. Gzip compressed JSON response + preserved public Cache-Control
	req := httptest.NewRequest(http.MethodGet, "/api/v1/categories", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}
	if got := w.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("expected Content-Encoding gzip, got %q", got)
	}
	if got := w.Header().Get("Cache-Control"); !strings.Contains(got, "public, max-age=60") {
		t.Fatalf("expected preserved Cache-Control public, got %q", got)
	}
	etag := w.Header().Get("ETag")
	if etag == "" {
		t.Fatalf("expected ETag header")
	}

	gzReader, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatalf("expected valid gzip stream: %v", err)
	}
	plain, err := io.ReadAll(gzReader)
	_ = gzReader.Close()
	if err != nil || !strings.Contains(string(plain), "wavelink-wavelink-") {
		t.Fatalf("unexpected decoded body: %q (err=%v)", string(plain), err)
	}

	// 2. Conditional 304 Not Modified must not write gzip headers or body
	req304 := httptest.NewRequest(http.MethodGet, "/api/v1/categories", nil)
	req304.Header.Set("Accept-Encoding", "gzip")
	req304.Header.Set("If-None-Match", etag)
	w304 := httptest.NewRecorder()
	r.ServeHTTP(w304, req304)

	if w304.Code != http.StatusNotModified {
		t.Fatalf("expected 304 Not Modified, got %d", w304.Code)
	}
	if enc := w304.Header().Get("Content-Encoding"); enc != "" {
		t.Fatalf("expected empty Content-Encoding on 304, got %q", enc)
	}
	if w304.Body.Len() != 0 {
		t.Fatalf("expected empty body on 304, got %d bytes", w304.Body.Len())
	}

	// 3. /stream/* bypasses Gzip even with Accept-Encoding: gzip
	reqStream := httptest.NewRequest(http.MethodGet, "/stream/abc123", nil)
	reqStream.Header.Set("Accept-Encoding", "gzip")
	wStream := httptest.NewRecorder()
	r.ServeHTTP(wStream, reqStream)

	if wStream.Header().Get("Content-Encoding") != "" {
		t.Fatalf("expected /stream/* not to be gzipped, got %q", wStream.Header().Get("Content-Encoding"))
	}
	if wStream.Body.String() != "raw-audio-stream-bytes" {
		t.Fatalf("unexpected stream body: %q", wStream.Body.String())
	}
}
