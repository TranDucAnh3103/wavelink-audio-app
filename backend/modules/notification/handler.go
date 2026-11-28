package notification

import (
	"strconv"
	"strings"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	db  *gorm.DB
	hub *Hub
}

func NewHandler(db *gorm.DB) *Handler {
	h := NewHub()
	setDefaultHub(h)
	return &Handler{db: db, hub: h}
}

type UpdatePreferencesRequest struct {
	SystemAlerts      *bool `json:"systemAlerts"`
	NovelUpdates      *bool `json:"novelUpdates"`
	PromotionAlerts   *bool `json:"promotionAlerts"`
	ExternalAudio     *bool `json:"externalAudio"`
	BlockAll          *bool `json:"blockAll"`
	NotifyNewEpisodes *bool `json:"notifyNewEpisodes"`
	NotifyMembership  *bool `json:"notifyMembership"`
	NotifySystem      *bool `json:"notifySystem"`
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	notifs := rg.Group("/notifications")
	notifs.Use(middleware.RequireAuth())
	{
		notifs.GET("/ws", h.HandleWebSocket)
		notifs.GET("", h.GetNotifications)
		notifs.GET("/unread-count", h.GetUnreadCount)
		notifs.PUT("/:id/read", h.MarkAsRead)
		notifs.PUT("/read-all", h.MarkAllAsRead)
		notifs.DELETE("/:id", h.DeleteNotification)
		notifs.DELETE("", h.DeleteAllNotifications)
		notifs.GET("/preferences", h.GetPreferences)
		notifs.PUT("/preferences", h.UpdatePreferences)
	}
}

// CreateSafeNotification tạo thông báo an toàn, ngăn chặn spam lặp lại và tuân thủ cài đặt chặn thông báo
func CreateSafeNotification(db *gorm.DB, notif domain.Notification) (bool, error) {
	if notif.UserID == 0 {
		return false, nil
	}

	var pref domain.NotificationPreference
	if err := db.First(&pref, "user_id = ?", notif.UserID).Error; err == nil {
		// 1. Chặn toàn bộ thông báo nếu blockAll bật
		if pref.BlockAll {
			return false, nil
		}

		// 2. Kiểm tra tùy chọn loại thông báo
		switch notif.Type {
		case "SYSTEM":
			if !pref.SystemAlerts {
				return false, nil
			}
		case "NEW_EPISODE", "NOVEL_UPDATE", "AUDIO":
			if !pref.NovelUpdates {
				return false, nil
			}
		case "VIP", "VIP_EXPIRED", "MEMBERSHIP", "PROMOTION":
			if !pref.PromotionAlerts {
				return false, nil
			}
		}
	}

	// 3. Cơ chế chống spam (Anti-Spam & Deduplication): Không gửi thông báo trùng tiêu đề cho user trong 10 phút
	tenMinsAgo := time.Now().UTC().Add(-10 * time.Minute)
	var dupCount int64
	db.Model(&domain.Notification{}).
		Where("user_id = ? AND title = ? AND created_at >= ?", notif.UserID, notif.Title, tenMinsAgo).
		Count(&dupCount)

	if dupCount > 0 {
		return false, nil
	}

	if notif.CreatedAt.IsZero() {
		notif.CreatedAt = time.Now().UTC()
	}

	err := db.Create(&notif).Error
	if err == nil {
		if hub := getDefaultHub(); hub != nil {
			hub.PushToUser(notif.UserID, notif)
		}
	}
	return err == nil, err
}

// CreateBatchNotifications gửi thông báo hàng loạt cho nhiều người dùng bằng 1 truy vấn preferences và CreateInBatches.
// Bỏ qua chống trùng lặp 10 phút cho broadcast/thông báo chủ động từ admin.
func CreateBatchNotifications(db *gorm.DB, userIDs []uint, title, message, notifType, linkURL string) (int, error) {
	if db == nil || len(userIDs) == 0 {
		return 0, nil
	}

	uniqueIDs := make([]uint, 0, len(userIDs))
	seen := make(map[uint]struct{}, len(userIDs))
	for _, uid := range userIDs {
		if uid == 0 {
			continue
		}
		if _, ok := seen[uid]; ok {
			continue
		}
		seen[uid] = struct{}{}
		uniqueIDs = append(uniqueIDs, uid)
	}
	if len(uniqueIDs) == 0 {
		return 0, nil
	}

	var prefs []domain.NotificationPreference
	_ = db.Where("user_id IN ?", uniqueIDs).Find(&prefs).Error
	prefMap := make(map[uint]domain.NotificationPreference, len(prefs))
	for _, p := range prefs {
		prefMap[p.UserID] = p
	}

	upperType := strings.ToUpper(strings.TrimSpace(notifType))
	if upperType == "" {
		upperType = "SYSTEM"
	}
	now := time.Now().UTC()
	records := make([]domain.Notification, 0, len(uniqueIDs))
	for _, uid := range uniqueIDs {
		if pref, hasPref := prefMap[uid]; hasPref {
			if pref.BlockAll {
				continue
			}
			switch upperType {
			case "SYSTEM":
				if !pref.SystemAlerts {
					continue
				}
			case "NEW_EPISODE", "NOVEL_UPDATE", "AUDIO":
				if !pref.NovelUpdates {
					continue
				}
			case "VIP", "VIP_EXPIRED", "MEMBERSHIP", "PROMOTION":
				if !pref.PromotionAlerts {
					continue
				}
			}
		}

		records = append(records, domain.Notification{
			UserID:    uid,
			Title:     title,
			Message:   message,
			Type:      upperType,
			Link:      linkURL,
			CreatedAt: now,
		})
	}

	if len(records) == 0 {
		return 0, nil
	}

	if err := db.CreateInBatches(&records, 100).Error; err != nil {
		return 0, err
	}

	if hub := getDefaultHub(); hub != nil {
		for _, rec := range records {
			hub.PushToUser(rec.UserID, rec)
		}
	}

	return len(records), nil
}

func (h *Handler) GetNotifications(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	filter := strings.ToLower(strings.TrimSpace(c.Query("filter")))
	kind := strings.ToUpper(strings.TrimSpace(c.Query("type")))
	limit := 100
	if l, err := strconv.Atoi(strings.TrimSpace(c.Query("limit"))); err == nil && l > 0 {
		limit = l
		if limit > 200 {
			limit = 200
		}
	}

	var totalForSeed int64
	h.db.Model(&domain.Notification{}).Where("user_id = ?", userID).Count(&totalForSeed)

	var pref domain.NotificationPreference
	prefErr := h.db.First(&pref, "user_id = ?", userID).Error

	// Nếu user chưa có thông báo nào và chưa từng seed, tạo thông báo chào mừng & hướng dẫn 1 lần duy nhất
	if totalForSeed == 0 && (prefErr != nil || !pref.WelcomeSeeded) {
		welcomeNotifs := []domain.Notification{
			{
				UserID:    userID,
				Title:     "Chào mừng đến với WaveLink! 🎧",
				Message:   "Trải nghiệm nghe truyện Manga & Audiobook YouTube đỉnh cao với Virtual Audio Engine 0% quảng cáo gián đoạn trên WaveLink.",
				Type:      "SYSTEM",
				Link:      "/home",
				IsRead:    false,
				CreatedAt: time.Now().UTC().Add(-2 * time.Hour),
			},
			{
				UserID:    userID,
				Title:     "Tính năng chia tập 4 giờ tự động ⚡",
				Message:   "Nhập video dài hơn 20 tiếng, hệ thống sẽ tự động bóc tách thành các tập 4 giờ liên tục không ngắt quãng.",
				Type:      "SYSTEM",
				Link:      "/upload",
				IsRead:    false,
				CreatedAt: time.Now().UTC().Add(-1 * time.Hour),
			},
			{
				UserID:    userID,
				Title:     "Mở khóa VIP Member không giới hạn 👑",
				Message:   "Trở thành Hội viên VIP để nghe trọn bộ truyện độc quyền và cày truyện không giới hạn lượt import.",
				Type:      "VIP",
				Link:      "/membership",
				IsRead:    false,
				CreatedAt: time.Now().UTC(),
			},
		}
		for i := range welcomeNotifs {
			h.db.Create(&welcomeNotifs[i])
		}

		if prefErr != nil {
			pref = domain.NotificationPreference{
				UserID:          userID,
				SystemAlerts:    true,
				NovelUpdates:    true,
				PromotionAlerts: true,
				ExternalAudio:   true,
				BlockAll:        false,
				WelcomeSeeded:   true,
				UpdatedAt:       time.Now().UTC(),
			}
			h.db.Create(&pref)
		} else {
			h.db.Model(&pref).Update("welcome_seeded", true)
		}
	}

	q := h.db.Where("user_id = ?", userID)
	if filter == "unread" {
		q = q.Where("is_read = ?", false)
	}
	if kind != "" && kind != "ALL" {
		switch kind {
		case "VIP":
			q = q.Where("type IN ?", []string{"VIP", "VIP_EXPIRED", "MEMBERSHIP", "PROMOTION"})
		case "NEW_EPISODE", "AUDIO":
			q = q.Where("type IN ?", []string{"NEW_EPISODE", "NOVEL_UPDATE", "AUDIO"})
		default:
			q = q.Where("type = ?", kind)
		}
	}

	var list []domain.Notification
	q.Order("created_at DESC").Limit(limit).Find(&list)

	response.OK(c, list, nil)
}

func (h *Handler) GetUnreadCount(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	var count int64
	h.db.Model(&domain.Notification{}).Where("user_id = ? AND is_read = 0", userID).Count(&count)
	response.OK(c, gin.H{"unreadCount": count}, nil)
}

func (h *Handler) MarkAsRead(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "ID thông báo không hợp lệ")
		return
	}

	h.db.Model(&domain.Notification{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("is_read", true)

	response.OK(c, gin.H{"message": "Đã đánh dấu đã đọc"}, nil)
}

func (h *Handler) MarkAllAsRead(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	h.db.Model(&domain.Notification{}).
		Where("user_id = ?", userID).
		Update("is_read", true)

	response.OK(c, gin.H{"message": "Đã đánh dấu tất cả đã đọc"}, nil)
}

func (h *Handler) DeleteNotification(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "ID thông báo không hợp lệ")
		return
	}

	h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&domain.Notification{})
	response.OK(c, gin.H{"message": "Đã xóa thông báo thành công"}, nil)
}

func (h *Handler) DeleteAllNotifications(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)

	h.db.Where("user_id = ?", userID).Delete(&domain.Notification{})

	// Đảm bảo không tự tái tạo thông báo chào mừng sau khi người dùng chủ động xóa hết
	var pref domain.NotificationPreference
	if err := h.db.First(&pref, "user_id = ?", userID).Error; err == nil {
		h.db.Model(&pref).Update("welcome_seeded", true)
	} else {
		pref = domain.NotificationPreference{
			UserID:          userID,
			SystemAlerts:    true,
			NovelUpdates:    true,
			PromotionAlerts: true,
			ExternalAudio:   true,
			BlockAll:        false,
			WelcomeSeeded:   true,
			UpdatedAt:       time.Now().UTC(),
		}
		h.db.Create(&pref)
	}

	response.OK(c, gin.H{"message": "Đã xóa toàn bộ thông báo thành công"}, nil)
}

func (h *Handler) GetPreferences(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)

	var pref domain.NotificationPreference
	if err := h.db.First(&pref, "user_id = ?", userID).Error; err != nil {
		pref = domain.NotificationPreference{
			UserID:          userID,
			SystemAlerts:    true,
			NovelUpdates:    true,
			PromotionAlerts: true,
			ExternalAudio:   true,
			BlockAll:        false,
			WelcomeSeeded:   true,
			UpdatedAt:       time.Now().UTC(),
		}
		h.db.Create(&pref)
	}

	response.OK(c, gin.H{
		"systemAlerts":      pref.SystemAlerts,
		"novelUpdates":      pref.NovelUpdates,
		"promotionAlerts":   pref.PromotionAlerts,
		"externalAudio":     pref.ExternalAudio,
		"blockAll":          pref.BlockAll,
		"notifySystem":      pref.SystemAlerts,
		"notifyNewEpisodes": pref.NovelUpdates,
		"notifyMembership":  pref.PromotionAlerts,
	}, nil)
}

func (h *Handler) UpdatePreferences(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)

	var req UpdatePreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu cài đặt không hợp lệ")
		return
	}

	var pref domain.NotificationPreference
	if err := h.db.First(&pref, "user_id = ?", userID).Error; err != nil {
		pref = domain.NotificationPreference{
			UserID:          userID,
			SystemAlerts:    true,
			NovelUpdates:    true,
			PromotionAlerts: true,
			ExternalAudio:   true,
			BlockAll:        false,
			WelcomeSeeded:   true,
			UpdatedAt:       time.Now().UTC(),
		}
		h.db.Create(&pref)
	}

	updates := map[string]interface{}{
		"updated_at": time.Now().UTC(),
	}
	if req.SystemAlerts != nil {
		updates["system_alerts"] = *req.SystemAlerts
	} else if req.NotifySystem != nil {
		updates["system_alerts"] = *req.NotifySystem
	}

	if req.NovelUpdates != nil {
		updates["novel_updates"] = *req.NovelUpdates
	} else if req.NotifyNewEpisodes != nil {
		updates["novel_updates"] = *req.NotifyNewEpisodes
	}

	if req.PromotionAlerts != nil {
		updates["promotion_alerts"] = *req.PromotionAlerts
	} else if req.NotifyMembership != nil {
		updates["promotion_alerts"] = *req.NotifyMembership
	}

	if req.ExternalAudio != nil {
		updates["external_audio"] = *req.ExternalAudio
	}
	if req.BlockAll != nil {
		updates["block_all"] = *req.BlockAll
	}

	h.db.Model(&pref).Updates(updates)
	h.db.First(&pref, "user_id = ?", userID)

	response.OK(c, gin.H{
		"systemAlerts":      pref.SystemAlerts,
		"novelUpdates":      pref.NovelUpdates,
		"promotionAlerts":   pref.PromotionAlerts,
		"externalAudio":     pref.ExternalAudio,
		"blockAll":          pref.BlockAll,
		"notifySystem":      pref.SystemAlerts,
		"notifyNewEpisodes": pref.NovelUpdates,
		"notifyMembership":  pref.PromotionAlerts,
	}, nil)
}
