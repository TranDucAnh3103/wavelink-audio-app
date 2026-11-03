package community

import (
	"encoding/json"
	"log/slog"
	"math"
	"sort"
	"strconv"
	"strings"
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
	hub         *Hub
	cacheMu     sync.RWMutex
	topCache    []domain.TopListener
	topExpiry   time.Time
	vipCache    []domain.VipRankingMember
	vipExpiry   time.Time
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{
		db:  db,
		hub: NewHub(),
	}
}

type SendMessageRequest struct {
	Message       string `json:"message" binding:"required"`
	SharedAudioID *uint  `json:"sharedAudioId,omitempty"`
	SenderName    string `json:"senderName,omitempty"`
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	comm := rg.Group("/community")
	{
		comm.GET("/leaderboard/top-listeners", h.GetTopListeners)
		comm.GET("/leaderboard/vip", h.GetVipLeaderboard)
		comm.GET("/messages", h.GetMessages)
		comm.POST("/messages", h.SendMessage)
		comm.GET("/online-count", h.GetOnlineSummary)
		comm.GET("/ws", h.HandleWebSocket)

		// Admin management routes
		admin := comm.Group("")
		admin.Use(middleware.RequireAdmin())
		{
			admin.DELETE("/messages", h.ClearAllMessages)
			admin.DELETE("/messages/clear", h.ClearAllMessages)
			admin.POST("/messages/clear", h.ClearAllMessages)
			admin.DELETE("/messages/:id", h.DeleteMessage)
			admin.POST("/messages/:id/delete", h.DeleteMessage)
			admin.GET("/stats", h.GetCommunityStats)
		}
	}
}

// GetTopListeners trả về Top 10 độc giả cày giờ nghe nhiều nhất hệ thống
func (h *Handler) GetTopListeners(c *gin.Context) {
	h.cacheMu.RLock()
	if time.Now().Before(h.topExpiry) && len(h.topCache) > 0 {
		cached := h.topCache
		h.cacheMu.RUnlock()
		response.OK(c, cached, nil)
		return
	}
	h.cacheMu.RUnlock()

	type rawListener struct {
		ID           uint   `gorm:"column:id"`
		Username     string `gorm:"column:username"`
		AvatarURL    string `gorm:"column:avatar_url"`
		Role         string `gorm:"column:role"`
		Membership   string `gorm:"column:membership"`
		IsGuest      bool   `gorm:"column:is_guest"`
		TotalSeconds int64  `gorm:"column:total_seconds"`
	}

	var raw []rawListener
	err := h.db.Table("users").
		Select("users.id, users.username, users.avatar_url, users.role, users.membership, users.is_guest, COALESCE(SUM(listening_history.duration_listened), 0) as total_seconds").
		Joins("LEFT JOIN listening_history ON listening_history.user_id = users.id").
		Where("users.is_guest = ? OR users.is_guest IS NULL", false).
		Group("users.id, users.username, users.avatar_url, users.role, users.membership, users.is_guest").
		Order("total_seconds DESC, users.id ASC").
		Limit(10).
		Scan(&raw).Error

	if err != nil {
		slog.Error("Lỗi truy vấn Top Listeners", "error", err)
		response.Internal(c, "Lỗi khi tải bảng xếp hạng giờ nghe")
		return
	}

	var list []domain.TopListener
	for idx, r := range raw {
		hours := math.Round((float64(r.TotalSeconds)/3600.0)*10) / 10
		isVip := r.Role == domain.RoleVIP || r.Role == domain.RoleAdmin || r.Membership == domain.MembershipVIP

		item := domain.TopListener{
			Rank:         idx + 1,
			UserID:       r.ID,
			Username:     r.Username,
			AvatarURL:    r.AvatarURL,
			TotalSeconds: r.TotalSeconds,
			TotalHours:   hours,
			IsVIP:        isVip,
			Role:         r.Role,
			Membership:   r.Membership,
		}

		// Lấy tên truyện nghe gần nhất nếu có
		var lastHist domain.ListeningHistory
		if err := h.db.Where("user_id = ?", r.ID).Order("created_at DESC").Preload("Audio").First(&lastHist).Error; err == nil && lastHist.Audio != nil {
			item.LastAudioTitle = lastHist.Audio.Title
		}

		list = append(list, item)
	}

	if list == nil {
		list = []domain.TopListener{}
	}

	h.cacheMu.Lock()
	h.topCache = list
	h.topExpiry = time.Now().Add(15 * time.Second)
	h.cacheMu.Unlock()

	response.OK(c, list, nil)
}

// GetVipLeaderboard trả về Bảng vàng Độc giả VIP vinh danh thành viên cao cấp
func (h *Handler) GetVipLeaderboard(c *gin.Context) {
	h.cacheMu.RLock()
	if time.Now().Before(h.vipExpiry) && len(h.vipCache) > 0 {
		cached := h.vipCache
		h.cacheMu.RUnlock()
		response.OK(c, cached, nil)
		return
	}
	h.cacheMu.RUnlock()

	var vipUsers []domain.User
	err := h.db.Where("(role = ? OR role = ? OR membership = ?) AND (is_guest = ? OR is_guest IS NULL)",
		domain.RoleVIP, domain.RoleAdmin, domain.MembershipVIP, false).
		Where("vip_expires_at IS NULL OR vip_expires_at > ?", time.Now()).
		Find(&vipUsers).Error

	if err != nil {
		slog.Error("Lỗi truy vấn VIP Leaderboard", "error", err)
		response.Internal(c, "Lỗi khi tải bảng vàng VIP")
		return
	}

	var list []domain.VipRankingMember
	for _, u := range vipUsers {
		var sumRes struct {
			TotalSec int64
		}
		h.db.Model(&domain.ListeningHistory{}).
			Select("COALESCE(SUM(duration_listened), 0) as total_sec").
			Where("user_id = ?", u.ID).
			Scan(&sumRes)

		hours := math.Round((float64(sumRes.TotalSec)/3600.0)*10) / 10

		badge := "VIP Hoàng Kim"
		if u.Role == domain.RoleAdmin {
			badge = "ADMIN Sáng Lập"
		} else if u.VipExpiresAt != nil {
			daysLeft := int(time.Until(*u.VipExpiresAt).Hours() / 24)
			if daysLeft >= 180 {
				badge = "VIP Kim Cương"
			} else if daysLeft >= 60 {
				badge = "VIP 1 Năm"
			} else if daysLeft >= 25 {
				badge = "VIP 6 Tháng"
			} else {
				badge = "VIP 1 Tháng"
			}
		}

		item := domain.VipRankingMember{
			UserID:       u.ID,
			Username:     u.Username,
			AvatarURL:    u.AvatarURL,
			Role:         u.Role,
			Membership:   u.Membership,
			VipExpiresAt: u.VipExpiresAt,
			VipBadge:     badge,
			TotalHours:   hours,
			JoinedAt:     u.CreatedAt,
		}
		list = append(list, item)
	}

	// Sắp xếp theo: ADMIN đứng đầu, tiếp theo là số giờ cày truyện cao nhất
	sort.Slice(list, func(i, j int) bool {
		if list[i].Role == domain.RoleAdmin && list[j].Role != domain.RoleAdmin {
			return true
		}
		if list[i].Role != domain.RoleAdmin && list[j].Role == domain.RoleAdmin {
			return false
		}
		return list[i].TotalHours > list[j].TotalHours
	})

	for i := range list {
		list[i].Rank = i + 1
	}

	if list == nil {
		list = []domain.VipRankingMember{}
	}

	h.cacheMu.Lock()
	h.vipCache = list
	h.vipExpiry = time.Now().Add(15 * time.Second)
	h.cacheMu.Unlock()

	response.OK(c, list, nil)
}

// GetMessages lấy danh sách tin nhắn chat gần đây trong phòng thảo luận
func (h *Handler) GetMessages(c *gin.Context) {
	limit := 50
	limitStr := strings.TrimSpace(c.Query("limit"))
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
		if limit > 2000 {
			limit = 2000
		}
	} else if limitStr == "all" || limitStr == "0" || c.Query("all") == "true" {
		limit = 2000
	}

	var messages []domain.CommunityMessage
	err := h.db.Order("id DESC").
		Limit(limit).
		Preload("SharedAudio").
		Find(&messages).Error

	if err != nil {
		slog.Error("Lỗi truy vấn tin nhắn cộng đồng", "error", err)
		response.Internal(c, "Lỗi khi tải lịch sử tin nhắn")
		return
	}

	// Đảo chiều mảng để trả về theo thứ tự thời gian từ cũ tới mới nhất
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	response.OK(c, messages, nil)
}

// SendMessage xử lý gửi tin nhắn mới (qua HTTP POST) và phát sóng realtime
func (h *Handler) SendMessage(c *gin.Context) {
	var req SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Nội dung tin nhắn không hợp lệ")
		return
	}

	msgText := strings.TrimSpace(req.Message)
	if msgText == "" {
		response.BadRequest(c, "Nội dung tin nhắn không được để trống")
		return
	}
	if len(msgText) > 1000 {
		response.BadRequest(c, "Nội dung tin nhắn vượt quá giới hạn 1000 ký tự")
		return
	}

	userID := middleware.GetCurrentUserID(c)
	isGuestVal, _ := c.Get("isGuest")
	isGuest, _ := isGuestVal.(bool)

	var user domain.User
	if userID > 0 && !isGuest {
		if err := h.db.First(&user, userID).Error; err != nil {
			user = domain.User{}
		}
	}

	var senderUsername string
	var senderAvatar string
	var senderRole string
	var isVip bool
	var msgUserID uint

	// Đảm bảo chỉ khi đăng nhập tài khoản thực sự (không phải khách) mới lấy danh tính user
	if user.ID > 0 && !user.IsGuest {
		msgUserID = user.ID
		senderUsername = user.Username
		senderAvatar = user.AvatarURL
		senderRole = user.Role
		isVip = user.Role == domain.RoleVIP || user.Role == domain.RoleAdmin || user.Membership == domain.MembershipVIP
	} else {
		msgUserID = 0
		senderUsername = "Khách Nghe Thử"
		if req.SenderName != "" && (strings.HasPrefix(req.SenderName, "Khách") || strings.EqualFold(req.SenderName, "Khách vãng lai")) {
			senderUsername = req.SenderName
		}
		senderAvatar = ""
		senderRole = domain.RoleGuest
		isVip = false
	}

	var sharedID *uint
	if req.SharedAudioID != nil && *req.SharedAudioID > 0 {
		var audio domain.Audio
		if err := h.db.First(&audio, *req.SharedAudioID).Error; err == nil {
			sharedID = &audio.ID
		}
	}

	newMsg := domain.CommunityMessage{
		UserID:        msgUserID,
		Username:      senderUsername,
		AvatarURL:     senderAvatar,
		IsVIP:         isVip,
		Role:          senderRole,
		Message:       msgText,
		SharedAudioID: sharedID,
		CreatedAt:     time.Now().UTC(),
	}

	if err := h.db.Create(&newMsg).Error; err != nil {
		slog.Error("Lỗi lưu tin nhắn cộng đồng", "error", err)
		response.Internal(c, "Không thể gửi tin nhắn")
		return
	}

	if newMsg.SharedAudioID != nil {
		h.db.Preload("SharedAudio").First(&newMsg, newMsg.ID)
	}

	// Phát sóng ngay lập tức tới toàn bộ người dùng đang online qua WebSocket
	h.hub.Broadcast(WSMessage{
		Type: "new_message",
		Data: newMsg,
	})

	response.OK(c, newMsg, nil)
}

// DeleteMessage xóa 1 tin nhắn chỉ định (Dành cho Quản trị viên)
func (h *Handler) DeleteMessage(c *gin.Context) {
	id := c.Param("id")
	var msg domain.CommunityMessage
	if err := h.db.First(&msg, id).Error; err == nil {
		_ = h.db.Delete(&msg).Error
	} else {
		// Thử tìm theo id kiểu số hoặc chuỗi để xóa triệt để
		h.db.Where("id = ?", id).Delete(&domain.CommunityMessage{})
	}

	// Broadcast xóa tin nhắn realtime tới các client đang kết nối
	h.hub.Broadcast(WSMessage{
		Type: "delete_message",
		Data: gin.H{"id": id},
	})

	response.OK(c, gin.H{"deletedId": id}, "Đã xóa tin nhắn thành công")
}

// ClearAllMessages dọn dẹp toàn bộ phòng chat (Dành cho Quản trị viên)
func (h *Handler) ClearAllMessages(c *gin.Context) {
	_ = h.db.Exec("DELETE FROM community_messages").Error

	h.hub.Broadcast(WSMessage{
		Type: "clear_messages",
	})

	response.OK(c, gin.H{"cleared": true}, "Đã dọn dẹp sạch toàn bộ phòng chat")
}

// GetOnlineSummary trả về số người online thực tế và số hội viên VIP thật trong hệ thống
func (h *Handler) GetOnlineSummary(c *gin.Context) {
	var vipCount int64
	h.db.Model(&domain.User{}).
		Where("(role = ? OR role = ? OR membership = ?) AND (is_guest = 0 OR is_guest IS NULL)",
			domain.RoleVIP, domain.RoleAdmin, domain.MembershipVIP).
		Where("vip_expires_at IS NULL OR vip_expires_at > ?", time.Now()).
		Count(&vipCount)

	var totalMessages int64
	h.db.Model(&domain.CommunityMessage{}).Count(&totalMessages)

	onlineCount := h.hub.OnlineCount()

	response.OK(c, gin.H{
		"onlineCount":   onlineCount,
		"vipCount":      vipCount,
		"totalMessages": totalMessages,
	}, nil)
}

// GetCommunityStats trả về số liệu thống kê phòng chat và cộng đồng cho Admin
func (h *Handler) GetCommunityStats(c *gin.Context) {
	var totalMessages int64
	h.db.Model(&domain.CommunityMessage{}).Count(&totalMessages)

	var vipChatters int64
	h.db.Model(&domain.CommunityMessage{}).Where("is_vip = ? OR role IN (?, ?)", true, domain.RoleVIP, domain.RoleAdmin).Distinct("username").Count(&vipChatters)

	var guestChatters int64
	h.db.Model(&domain.CommunityMessage{}).Where("role = ? OR user_id = 0", domain.RoleGuest).Count(&guestChatters)

	var totalVipMembers int64
	h.db.Model(&domain.User{}).
		Where("(role = ? OR role = ? OR membership = ?) AND (is_guest = 0 OR is_guest IS NULL)",
			domain.RoleVIP, domain.RoleAdmin, domain.MembershipVIP).
		Where("vip_expires_at IS NULL OR vip_expires_at > ?", time.Now()).
		Count(&totalVipMembers)

	onlineCount := h.hub.OnlineCount()

	response.OK(c, gin.H{
		"totalMessages":   totalMessages,
		"onlineCount":     onlineCount,
		"vipChatters":     vipChatters,
		"guestChatters":   guestChatters,
		"totalVipMembers": totalVipMembers,
	}, nil)
}

// HandleWebSocket nâng cấp kết nối HTTP thành WebSocket phục vụ chat hai chiều realtime
func (h *Handler) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Warn("Lỗi nâng cấp kết nối WebSocket", "error", err)
		return
	}

	userID := middleware.GetCurrentUserID(c)
	isGuestVal, _ := c.Get("isGuest")
	isGuest, _ := isGuestVal.(bool)

	var user domain.User
	if userID > 0 && !isGuest {
		if err := h.db.First(&user, userID).Error; err != nil {
			user = domain.User{}
		}
	}

	username := "Khách Nghe Thử"
	isVIP := false
	var clientUserID uint

	if user.ID > 0 && !user.IsGuest {
		clientUserID = user.ID
		username = user.Username
		isVIP = user.Role == domain.RoleVIP || user.Role == domain.RoleAdmin || user.Membership == domain.MembershipVIP
	}

	client := &Client{
		hub:      h.hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		userID:   clientUserID,
		username: username,
		isVIP:    isVIP,
	}

	h.hub.register <- client

	// Gửi ngay số người đang trực tuyến
	onlineCount := h.hub.OnlineCount()
	client.hub.BroadcastOnlineCount(onlineCount)

	go client.writePump()
	go client.readPump(func(cl *Client, data []byte) {
		var incoming struct {
			Type          string `json:"type"`
			Message       string `json:"message"`
			SharedAudioID *uint  `json:"sharedAudioId,omitempty"`
		}
		if err := json.Unmarshal(data, &incoming); err != nil {
			return
		}

		if incoming.Type == "ping" {
			cl.send <- []byte(`{"type":"pong"}`)
			return
		}

		if incoming.Type == "chat" {
			text := strings.TrimSpace(incoming.Message)
			if text == "" || len(text) > 1000 {
				return
			}

			var sharedID *uint
			if incoming.SharedAudioID != nil && *incoming.SharedAudioID > 0 {
				var audio domain.Audio
				if err := h.db.First(&audio, *incoming.SharedAudioID).Error; err == nil {
					sharedID = &audio.ID
				}
			}

			msgRole := domain.RoleUser
			if cl.userID == 0 {
				msgRole = domain.RoleGuest
			} else if cl.isVIP {
				msgRole = domain.RoleVIP
			}

			msg := domain.CommunityMessage{
				UserID:        cl.userID,
				Username:      cl.username,
				IsVIP:         cl.isVIP,
				Role:          msgRole,
				Message:       text,
				SharedAudioID: sharedID,
				CreatedAt:     time.Now().UTC(),
			}

			if err := h.db.Create(&msg).Error; err == nil {
				if msg.SharedAudioID != nil {
					h.db.Preload("SharedAudio").First(&msg, msg.ID)
				}
				h.hub.Broadcast(WSMessage{
					Type: "new_message",
					Data: msg,
				})
			}
		}
	})
}
