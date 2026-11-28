package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name                 string
		allowedOriginsConfig string
		requestOrigin        string
		expectedAllowOrigin  string
		expectedCredentials  string
	}{
		{
			name:                 "Specific zHost domain auto-allowed",
			allowedOriginsConfig: "http://localhost:3000",
			requestOrigin:        "https://wavelink-audio-app.zhost.education",
			expectedAllowOrigin:  "https://wavelink-audio-app.zhost.education",
			expectedCredentials:  "true",
		},
		{
			name:                 "Wildcard zHost subdomain allowed",
			allowedOriginsConfig: "http://localhost:3000",
			requestOrigin:        "https://sub.zhost.education",
			expectedAllowOrigin:  "https://sub.zhost.education",
			expectedCredentials:  "true",
		},
		{
			name:                 "Vercel domain allowed via wildcard",
			allowedOriginsConfig: "http://localhost:3000",
			requestOrigin:        "https://wavelink-audio-app.vercel.app",
			expectedAllowOrigin:  "https://wavelink-audio-app.vercel.app",
			expectedCredentials:  "true",
		},
		{
			name:                 "Explicitly configured origin allowed",
			allowedOriginsConfig: "http://localhost:3000,http://127.0.0.1:5173",
			requestOrigin:        "http://localhost:3000",
			expectedAllowOrigin:  "http://localhost:3000",
			expectedCredentials:  "true",
		},
		{
			name:                 "Unknown origin rejected",
			allowedOriginsConfig: "http://localhost:3000",
			requestOrigin:        "https://malicious-attacker.com",
			expectedAllowOrigin:  "",
			expectedCredentials:  "",
		},
		{
			name:                 "Allow all wildcard",
			allowedOriginsConfig: "*",
			requestOrigin:        "https://random-site.com",
			expectedAllowOrigin:  "*",
			expectedCredentials:  "", // W3C: No credentials when wildcard *
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := gin.New()
			r.Use(CORS(tt.allowedOriginsConfig))
			r.GET("/ping", func(c *gin.Context) {
				c.String(http.StatusOK, "pong")
			})

			req, _ := http.NewRequest(http.MethodGet, "/ping", nil)
			if tt.requestOrigin != "" {
				req.Header.Set("Origin", tt.requestOrigin)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			allowOrigin := w.Header().Get("Access-Control-Allow-Origin")
			if allowOrigin != tt.expectedAllowOrigin {
				t.Errorf("expected Access-Control-Allow-Origin '%s', got '%s'", tt.expectedAllowOrigin, allowOrigin)
			}

			allowCredentials := w.Header().Get("Access-Control-Allow-Credentials")
			if allowCredentials != tt.expectedCredentials {
				t.Errorf("expected Access-Control-Allow-Credentials '%s', got '%s'", tt.expectedCredentials, allowCredentials)
			}
		})
	}
}

func TestCORSPreflightOPTIONS(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.Use(CORS("https://wavelink-audio-app.vercel.app"))
	r.POST("/api/test", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req, _ := http.NewRequest(http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "https://wavelink-audio-app.zhost.education")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected preflight status 204 No Content, got %d", w.Code)
	}

	if w.Header().Get("Access-Control-Allow-Origin") != "https://wavelink-audio-app.zhost.education" {
		t.Errorf("expected allow origin header for zHost, got '%s'", w.Header().Get("Access-Control-Allow-Origin"))
	}

	allowMethods := w.Header().Get("Access-Control-Allow-Methods")
	if !stringsContains(allowMethods, "PATCH") {
		t.Errorf("expected PATCH in Access-Control-Allow-Methods, got '%s'", allowMethods)
	}
	allowHeaders := w.Header().Get("Access-Control-Allow-Headers")
	if !stringsContains(allowHeaders, "If-None-Match") {
		t.Errorf("expected If-None-Match in Access-Control-Allow-Headers, got '%s'", allowHeaders)
	}
	exposeHeaders := w.Header().Get("Access-Control-Expose-Headers")
	if !stringsContains(exposeHeaders, "X-Refreshed-Token") || !stringsContains(exposeHeaders, "ETag") {
		t.Errorf("expected ETag and X-Refreshed-Token in Access-Control-Expose-Headers, got '%s'", exposeHeaders)
	}
}

func TestCORSOriginTrailingSlashTrimmed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CORS("http://localhost:3000/"))
	r.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "pong")
	})

	req, _ := http.NewRequest(http.MethodGet, "/ping", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("expected trailing-slash origin config to match, got '%s'", w.Header().Get("Access-Control-Allow-Origin"))
	}
}

func stringsContains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
