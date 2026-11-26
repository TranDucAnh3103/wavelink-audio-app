package stats

import (
	"sync"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	db          *gorm.DB
	cacheMu     sync.RWMutex
	globalStats gin.H
	cacheExpiry time.Time
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{db: db}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/stats", h.GetStats)
}

func (h *Handler) GetStats(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)

	// Nếu là khách vãng lai, dùng In-memory Cache 60s để tránh Full Table Scan liên tục
	if userID == 0 {
		c.Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
		h.cacheMu.RLock()
		if time.Now().Before(h.cacheExpiry) && h.globalStats != nil {
			cached := h.globalStats
			h.cacheMu.RUnlock()
			response.OK(c, cached, nil)
			return
		}
		h.cacheMu.RUnlock()
	}

	var totalAudios int64
	h.db.Model(&domain.Audio{}).Where("status = ?", domain.StatusActive).Count(&totalAudios)

	var totalEpisodes int64
	h.db.Model(&domain.Episode{}).Count(&totalEpisodes)

	var listeningCount int64
	var completedCount int64
	var totalSecs int64

	if userID > 0 {
		// Thống kê cá nhân của người dùng
		h.db.Model(&domain.ListeningProgress{}).
			Where("user_id = ? AND progress_percent > 0 AND progress_percent < 95", userID).
			Count(&listeningCount)

		h.db.Model(&domain.ListeningProgress{}).
			Where("user_id = ? AND (progress_percent >= 95 OR completed = 1)", userID).
			Count(&completedCount)

		var sumResult struct {
			Total int64
		}
		h.db.Model(&domain.ListeningHistory{}).
			Select("COALESCE(SUM(duration_listened), 0) as total").
			Where("user_id = ?", userID).
			Scan(&sumResult)
		totalSecs = sumResult.Total
	} else {
		// Thống kê toàn hệ thống (Dùng cho khách)
		h.db.Model(&domain.ListeningProgress{}).
			Where("progress_percent > 0 AND progress_percent < 95").
			Count(&listeningCount)

		h.db.Model(&domain.ListeningProgress{}).
			Where("progress_percent >= 95 OR completed = 1").
			Count(&completedCount)

		var sumResult struct {
			Total int64
		}
		h.db.Model(&domain.ListeningHistory{}).
			Select("COALESCE(SUM(duration_listened), 0) as total").
			Scan(&sumResult)
		totalSecs = sumResult.Total
	}

	totalHours := totalSecs / 3600
	if totalHours == 0 && totalSecs > 0 {
		totalHours = 1
	}

	result := gin.H{
		"totalAudios":        totalAudios,
		"listeningCount":     listeningCount,
		"completedCount":     completedCount,
		"totalHoursListened": totalHours,
		"totalEpisodes":      totalEpisodes,
	}

	if userID == 0 {
		h.cacheMu.Lock()
		h.globalStats = result
		h.cacheExpiry = time.Now().Add(60 * time.Second)
		h.cacheMu.Unlock()
	}

	response.OK(c, result, nil)
}
