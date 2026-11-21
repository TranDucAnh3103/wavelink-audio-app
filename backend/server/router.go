package server

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"audio-app-backend/config"
	"audio-app-backend/modules/audio"
	"audio-app-backend/modules/auth"
	"audio-app-backend/modules/community"
	"audio-app-backend/modules/episode"
	"audio-app-backend/modules/favorite"
	"audio-app-backend/modules/history"
	"audio-app-backend/modules/membership"
	"audio-app-backend/modules/notification"
	"audio-app-backend/modules/progress"
	"audio-app-backend/modules/stats"
	"audio-app-backend/modules/taxonomy"
	"audio-app-backend/modules/user"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// SetupRouter cấu hình Gin Router và gắn kết toàn bộ các Module nghiệp vụ
func SetupRouter(cfg *config.Config, db *gorm.DB) *gin.Engine {
	// Phân tách chế độ theo môi trường: Release khi Production, Debug khi Development
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(gin.DebugMode)
	}

	r := gin.New()

	// Middlewares cốt lõi
	r.Use(gin.Recovery())
	r.Use(gin.Logger())
	r.Use(middleware.CORS(cfg.AllowedOrigins))
	r.Use(middleware.SessionMiddleware(cfg.JWTSecret))

	// Rate Limiters bảo vệ các endpoint công khai
	guestLimiter := middleware.NewRateLimiter(20)  // 20 req/min
	importLimiter := middleware.NewRateLimiter(10) // 10 req/min
	statsLimiter := middleware.NewRateLimiter(60)  // 60 req/min

	// Health Check
	r.GET("/health", func(c *gin.Context) {
		response.OK(c, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"database":  cfg.DBDriver,
			"env":       cfg.AppEnv,
		}, nil)
	})

	// API v1 Router Group
	v1 := r.Group("/api/v1")
	{
		v1.GET("/health", func(c *gin.Context) {
			response.OK(c, gin.H{"status": "ok", "env": cfg.AppEnv}, nil)
		})

		// 1. Auth Module (Kèm Rate Limiter cho Guest Login)
		authHandler := auth.NewHandler(db, cfg.JWTSecret)
		authGroup := v1.Group("/auth")
		{
			authGroup.POST("/guest", guestLimiter.Middleware(), authHandler.GuestLogin)
			authGroup.POST("/register", authHandler.Register)
			authGroup.POST("/login", authHandler.Login)
			authGroup.POST("/google", authHandler.GoogleLogin)
			authGroup.GET("/me", middleware.RequireAuth(), authHandler.GetMe)
			authGroup.POST("/logout", authHandler.Logout)
		}

		// 2. User Module
		userHandler := user.NewHandler(db)
		userHandler.RegisterRoutes(v1)

		// 3. Taxonomy Module (Categories & Tags có Cache)
		taxonomyHandler := taxonomy.NewHandler(db)
		taxonomyHandler.RegisterRoutes(v1)

		// 4. Audio Module (Kèm Rate Limiter cho Import)
		audioHandler := audio.NewHandler(db)
		audioGroup := v1.Group("/audios")
		{
			audioGroup.GET("", audioHandler.ListAudios)
			audioGroup.GET("/quota", audioHandler.GetImportQuota)
			audioGroup.GET("/preview-youtube", audioHandler.PreviewYouTube)
			audioGroup.POST("/preview-youtube", audioHandler.PreviewYouTube)
			audioGroup.GET("/:id", audioHandler.GetAudioByID)
			audioGroup.POST("/import-youtube", importLimiter.Middleware(), middleware.RequireAuth(), audioHandler.ImportYouTube)
			audioGroup.PUT("/:id", middleware.RequireAuth(), audioHandler.UpdateAudio)
			audioGroup.DELETE("/:id", middleware.RequireAuth(), audioHandler.DeleteAudio)
			audioGroup.POST("/:id/refresh", middleware.RequireAuth(), audioHandler.RefreshAudio)
		}

		// 5. Episode Module
		episodeHandler := episode.NewHandler(db)
		episodeHandler.RegisterRoutes(v1)

		// 6. Progress Module (Sync 60s)
		progressHandler := progress.NewHandler(db)
		progressHandler.RegisterRoutes(v1)

		// 7. History Module
		historyHandler := history.NewHandler(db)
		historyHandler.RegisterRoutes(v1)

		// 8. Favorite Module
		favoriteHandler := favorite.NewHandler(db)
		favoriteHandler.RegisterRoutes(v1)

		// 9. Notification Module
		notificationHandler := notification.NewHandler(db)
		notificationHandler.RegisterRoutes(v1)

		// 10. Membership Module (VIP QR Demo & Admin Config)
		membershipHandler := membership.NewHandler(db, cfg)
		membershipHandler.RegisterRoutes(v1)

		// 11. Stats Module (Kèm Rate Limiter)
		statsHandler := stats.NewHandler(db)
		v1.GET("/stats", statsLimiter.Middleware(), statsHandler.GetStats)

		// 12. Community Module (Realtime Chat & Leaderboards)
		communityHandler := community.NewHandler(db)
		communityHandler.RegisterRoutes(v1)
	}

	// Phục vụ Frontend tĩnh (SPA Fallback)
	setupStaticFiles(r, cfg.StaticDir)

	return r
}

func setupStaticFiles(r *gin.Engine, staticDir string) {
	absDir, err := filepath.Abs(staticDir)
	if err != nil {
		absDir = staticDir
	}

	// Ưu tiên thư mục dist nếu Frontend đã được build bằng Vite/React
	distDir := filepath.Join(absDir, "dist")
	if stat, err := os.Stat(distDir); err == nil && stat.IsDir() {
		absDir = distDir
	}

	if _, err := os.Stat(absDir); os.IsNotExist(err) {
		return
	}

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/") {
			response.NotFound(c, "API endpoint không tồn tại")
			return
		}

		targetFile := filepath.Join(absDir, filepath.Clean(path))
		if stat, err := os.Stat(targetFile); err == nil && !stat.IsDir() {
			c.File(targetFile)
			return
		}

		// Fallback SPA về index.html
		c.File(filepath.Join(absDir, "index.html"))
	})
}
