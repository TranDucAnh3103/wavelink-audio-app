package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/core/logic"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const siteConfigCacheTTL = 5 * time.Second

var (
	siteConfigMu       sync.RWMutex
	cachedSiteConfig   domain.SiteConfig
	cachedSiteConfigDB *gorm.DB
	siteConfigCachedAt time.Time
)

// GetSiteConfig trả về cấu hình hệ thống từ cache trong bộ nhớ (TTL 5 giây) để tránh truy vấn DB lặp lại trên mỗi request.
func GetSiteConfig(db *gorm.DB) domain.SiteConfig {
	siteConfigMu.RLock()
	if db != nil && cachedSiteConfigDB == db && !siteConfigCachedAt.IsZero() && time.Since(siteConfigCachedAt) < siteConfigCacheTTL {
		cfg := cachedSiteConfig
		siteConfigMu.RUnlock()
		return cfg
	}
	siteConfigMu.RUnlock()

	cfg := logic.DefaultSiteConfig()
	if db == nil {
		return cfg
	}

	var s domain.SystemSetting
	if err := db.Session(&gorm.Session{}).Where("`key` = ?", "site_config").Take(&s).Error; err == nil && s.Value != "" {
		_ = json.Unmarshal([]byte(s.Value), &cfg)
	}
	if cfg.FreeImportDailyLimit <= 0 {
		cfg.FreeImportDailyLimit = logic.MaxFreeImportsPerDay
	}

	siteConfigMu.Lock()
	cachedSiteConfig = cfg
	cachedSiteConfigDB = db
	siteConfigCachedAt = time.Now()
	siteConfigMu.Unlock()

	return cfg
}

// InvalidateSiteConfigCache xóa cache cấu hình hệ thống ngay khi admin cập nhật thiết lập.
func InvalidateSiteConfigCache() {
	siteConfigMu.Lock()
	siteConfigCachedAt = time.Time{}
	cachedSiteConfigDB = nil
	siteConfigMu.Unlock()
}

// MaintenanceGuard chặn các request không phải admin/auth/health khi chế độ bảo trì đang bật.
func MaintenanceGuard(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}

		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/v1/health") ||
			strings.HasPrefix(path, "/api/v1/site-status") ||
			strings.HasPrefix(path, "/api/v1/auth/") ||
			strings.HasPrefix(path, "/api/v1/admin/") {
			c.Next()
			return
		}

		if GetCurrentUserRole(c) == domain.RoleAdmin {
			c.Next()
			return
		}

		cfg := GetSiteConfig(db)
		if cfg.MaintenanceMode {
			msg := strings.TrimSpace(cfg.MaintenanceMessage)
			if msg == "" {
				msg = "Hệ thống đang bảo trì. Vui lòng quay lại sau."
			}
			response.Error(c, http.StatusServiceUnavailable, "MAINTENANCE_MODE", msg)
			c.Abort()
			return
		}

		c.Next()
	}
}
