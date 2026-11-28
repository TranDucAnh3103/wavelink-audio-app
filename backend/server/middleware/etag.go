package middleware

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type etagWriter struct {
	gin.ResponseWriter
	buf    bytes.Buffer
	status int
}

func (w *etagWriter) Write(b []byte) (int, error)       { return w.buf.Write(b) }
func (w *etagWriter) WriteString(s string) (int, error) { return w.buf.WriteString(s) }
func (w *etagWriter) WriteHeader(code int)              { w.status = code }
func (w *etagWriter) WriteHeaderNow()                   {}

// ETag thêm validator cho các GET JSON: trình duyệt luôn xác thực lại (no-cache)
// và nhận 304 khi dữ liệu không đổi -> tiết kiệm băng thông và không để client giữ bản sao cũ.
// Dữ liệu phụ thuộc người dùng nên dùng "private" + Vary: Authorization.
func ETag() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet ||
			c.GetHeader("Range") != "" ||
			c.GetHeader("Upgrade") != "" ||
			strings.HasPrefix(c.Request.URL.Path, "/stream/") ||
			strings.HasPrefix(c.Request.URL.Path, "/api/v1/admin/export/") {
			c.Next()
			return
		}
		orig := c.Writer
		w := &etagWriter{ResponseWriter: orig, status: http.StatusOK}
		c.Writer = w
		c.Next()
		c.Writer = orig

		body := w.buf.Bytes()
		if w.status == http.StatusOK && len(body) > 0 {
			sum := sha1.Sum(body)
			tag := `"` + hex.EncodeToString(sum[:]) + `"`
			h := orig.Header()
			h.Set("ETag", tag)
			if h.Get("Cache-Control") == "" {
				h.Set("Cache-Control", "private, no-cache")
			}
			h.Add("Vary", "Authorization")
			for _, t := range strings.Split(c.GetHeader("If-None-Match"), ",") {
				if strings.TrimSpace(t) == tag {
					orig.WriteHeader(http.StatusNotModified)
					orig.WriteHeaderNow()
					return
				}
			}
		}
		orig.WriteHeader(w.status)
		_, _ = orig.Write(body)
	}
}
