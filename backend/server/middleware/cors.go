package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// IsOriginAllowed checks whether a request Origin matches allowedOrigins or WaveLink's official zHost/Vercel origins.
func IsOriginAllowed(origin, allowedOrigins string) (allowed bool, allowAll bool) {
	origins := strings.Split(allowedOrigins, ",")
	whitelist := make(map[string]bool)
	wildcards := make([]string, 0)

	for _, o := range origins {
		trimmed := strings.TrimSpace(o)
		if trimmed == "*" {
			allowAll = true
		} else if strings.Contains(trimmed, "*") {
			wildcards = append(wildcards, trimmed)
		} else if trimmed != "" {
			whitelist[trimmed] = true
		}
	}

	// Luôn đảm bảo domain chính thức của WaveLink trên zHost và Vercel được phép kết nối
	whitelist["https://wavelink-audio-app.zhost.education"] = true
	whitelist["http://wavelink-audio-app.zhost.education"] = true
	wildcards = append(wildcards, "*.zhost.education", "*.vercel.app")

	if allowAll {
		return true, true
	}
	if origin == "" {
		return false, false
	}
	if whitelist[origin] {
		return true, false
	}
	cleanOrigin := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
	cleanOrigin = strings.Split(cleanOrigin, ":")[0]
	for _, wc := range wildcards {
		cleanWc := strings.TrimPrefix(strings.TrimPrefix(wc, "https://"), "http://")
		if strings.HasPrefix(cleanWc, "*.") {
			suffix := strings.TrimPrefix(cleanWc, "*")
			if strings.HasSuffix(cleanOrigin, suffix) || cleanOrigin == strings.TrimPrefix(suffix, ".") {
				return true, false
			}
		}
	}
	return false, false
}

// CORS cấu hình chuẩn W3C và an toàn, tuân thủ danh sách whitelist allowedOrigins
func CORS(allowedOrigins string) gin.HandlerFunc {
	return func(c *gin.Context) {
		reqOrigin := c.Request.Header.Get("Origin")
		allowed, allowAll := IsOriginAllowed(reqOrigin, allowedOrigins)

		if allowAll {
			// Chuẩn W3C: Khi Allow-Origin là "*", tuyệt đối không gửi Allow-Credentials = true
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		} else if allowed {
			// Khớp với whitelist cụ thể hoặc wildcard: Cho phép Credentials an toàn
			c.Writer.Header().Set("Access-Control-Allow-Origin", reqOrigin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Vary", "Origin")
		}

		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, Range")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, HEAD, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
