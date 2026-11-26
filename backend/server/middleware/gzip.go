package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

var gzipWriterPool = sync.Pool{
	New: func() interface{} {
		w, _ := gzip.NewWriterLevel(io.Discard, gzip.DefaultCompression)
		return w
	},
}

type gzipResponseWriter struct {
	gin.ResponseWriter
	gz          *gzip.Writer
	status      int
	wroteHeader bool
	wroteGzip   bool
	bypass      bool
}

func (w *gzipResponseWriter) WriteHeader(code int) {
	w.status = code
	if code == http.StatusNoContent || code == http.StatusNotModified || code < http.StatusOK {
		w.bypass = true
		w.wroteHeader = true
		w.ResponseWriter.WriteHeader(code)
	}
}

func (w *gzipResponseWriter) WriteHeaderNow() {
	if !w.wroteHeader {
		if w.status == 0 {
			w.status = http.StatusOK
		}
		w.bypass = true
		w.wroteHeader = true
		w.ResponseWriter.WriteHeader(w.status)
	}
	w.ResponseWriter.WriteHeaderNow()
}

func (w *gzipResponseWriter) ensureGzipStarted() {
	if w.wroteHeader || w.bypass {
		return
	}
	if w.ResponseWriter.Header().Get("Content-Encoding") != "" {
		w.bypass = true
		w.wroteHeader = true
		if w.status == 0 {
			w.status = http.StatusOK
		}
		w.ResponseWriter.WriteHeader(w.status)
		return
	}
	if w.status == 0 {
		w.status = http.StatusOK
	}
	h := w.ResponseWriter.Header()
	h.Set("Content-Encoding", "gzip")
	h.Add("Vary", "Accept-Encoding")
	h.Del("Content-Length")
	w.wroteHeader = true
	w.wroteGzip = true
	w.ResponseWriter.WriteHeader(w.status)
	w.gz.Reset(w.ResponseWriter)
}

func (w *gzipResponseWriter) Write(data []byte) (int, error) {
	if w.bypass {
		return w.ResponseWriter.Write(data)
	}
	if len(data) == 0 {
		return 0, nil
	}
	w.ensureGzipStarted()
	if w.bypass {
		return w.ResponseWriter.Write(data)
	}
	return w.gz.Write(data)
}

func (w *gzipResponseWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

// Gzip nén response JSON/text khi client gửi Accept-Encoding: gzip,
// bỏ qua route stream range audio, WebSocket và các phản hồi 204/304.
func Gzip() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !strings.Contains(c.GetHeader("Accept-Encoding"), "gzip") ||
			strings.HasPrefix(c.Request.URL.Path, "/stream/") ||
			c.GetHeader("Range") != "" ||
			c.GetHeader("Upgrade") != "" {
			c.Next()
			return
		}

		gz := gzipWriterPool.Get().(*gzip.Writer)
		orig := c.Writer
		gw := &gzipResponseWriter{
			ResponseWriter: orig,
			gz:             gz,
		}
		c.Writer = gw

		defer func() {
			c.Writer = orig
			if gw.wroteGzip {
				_ = gz.Close()
			} else if !gw.wroteHeader && gw.status != 0 {
				orig.WriteHeader(gw.status)
			}
			gz.Reset(io.Discard)
			gzipWriterPool.Put(gz)
		}()

		c.Next()
	}
}
