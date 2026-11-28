// Package admin gom toÃ n bá»™ nghiá»‡p vá»¥ quáº£n trá»‹: ngÆ°á»i dÃ¹ng, Ä‘Æ¡n hÃ ng, ná»™i dung, thÃ´ng bÃ¡o, tá»•ng quan.
package admin

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/infra/external"
	"audio-app-backend/modules/notification"
	"audio-app-backend/modules/stream"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	db                *gorm.DB
	streamCache       *stream.URLCache
	streamExtractor   external.StreamExtractor
	onTaxonomyChanged func()
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{db: db}
}

func (h *Handler) SetStreamDeps(cache *stream.URLCache, extractor external.StreamExtractor) {
	h.streamCache = cache
	h.streamExtractor = extractor
}

func (h *Handler) SetOnTaxonomyChanged(fn func()) {
	h.onTaxonomyChanged = fn
}

func (h *Handler) notifyTaxonomyChanged() {
	if h.onTaxonomyChanged != nil {
		h.onTaxonomyChanged()
	}
}

// LoadBanned náº¡p danh sÃ¡ch tÃ i khoáº£n Ä‘ang bá»‹ khÃ³a vÃ o bá»™ nhá»› khi khá»Ÿi Ä‘á»™ng.
func LoadBanned(db *gorm.DB) {
	var ids []uint
	if err := db.Model(&domain.User{}).Where("is_banned = ?", true).Pluck("id", &ids).Error; err != nil {
		return
	}
	for _, id := range ids {
		middleware.SetBanned(id, true)
	}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/admin")
	g.Use(middleware.RequireAuth(), middleware.RequireAdmin())
	{
		g.GET("/dashboard", h.Dashboard)

		g.GET("/users", h.ListUsers)
		g.POST("/users", h.CreateUser)
		g.POST("/users/bulk", h.BulkUsers)
		g.GET("/users/:id", h.GetUser)
		g.PATCH("/users/:id", h.UpdateUser)
		g.DELETE("/users/:id", h.DeleteUser)
		g.POST("/users/:id/vip", h.GrantVIP)
		g.DELETE("/users/:id/vip", h.RevokeVIP)
		g.POST("/users/:id/ban", h.BanUser)
		g.POST("/users/:id/unban", h.UnbanUser)
		g.POST("/users/:id/password", h.ResetPassword)
		g.POST("/users/:id/notify", h.NotifyUser)

		g.GET("/orders", h.ListOrders)
		g.POST("/orders/:code/confirm", h.ConfirmOrder)
		g.POST("/orders/:code/cancel", h.CancelOrder)
		g.POST("/orders/:code/refund", h.RefundOrder)

		g.GET("/audios", h.ListAudios)
		g.POST("/audios/bulk", h.BulkAudios)
		g.POST("/audios/import-batch", h.ImportBatch)
		g.POST("/audios/check-streams", h.CheckStreamsBatch)
		g.GET("/audios/:id/episodes", h.ListAudioEpisodes)
		g.POST("/audios/:id/episodes/batch-chapters", h.BatchChapters)
		g.POST("/episodes/bulk", h.BulkEpisodes)
		g.GET("/imports/stats", h.ImportStats)

		g.GET("/tickets", h.ListTickets)
		g.PATCH("/tickets/:id", h.UpdateTicket)
		g.GET("/audit-logs", h.ListAuditLogs)
		g.GET("/settings", h.GetSettings)
		g.PUT("/settings", h.UpdateSettings)
		g.GET("/stream/status", h.GetStreamStatus)
		g.POST("/stream/clear-cache", h.ClearStreamCache)
		g.GET("/export/users", h.ExportUsersCSV)
		g.GET("/export/orders", h.ExportOrdersCSV)

		g.POST("/broadcast", h.Broadcast)
	}
}

// ---------- helpers ----------

func pageParams(c *gin.Context) (page, size int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ = strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return
}

func like(q string) string {
	q = strings.NewReplacer("%", "", "_", "").Replace(strings.ToLower(strings.TrimSpace(q)))
	return "%" + q + "%"
}

func paramID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil || id == 0 {
		response.BadRequest(c, "ID khÃ´ng há»£p lá»‡")
		return 0, false
	}
	return uint(id), true
}

func isVIPActive(u domain.User, now time.Time) bool {
	if u.Role == domain.RoleAdmin {
		return false
	}
	return u.Membership == domain.MembershipVIP && (u.VipExpiresAt == nil || u.VipExpiresAt.After(now))
}

func daysLeft(u domain.User, now time.Time) int {
	if u.VipExpiresAt == nil || !u.VipExpiresAt.After(now) {
		return 0
	}
	return int((u.VipExpiresAt.Sub(now).Hours() + 23) / 24)
}

func (h *Handler) notify(userID uint, title, message, link, kind string) {
	if userID == 0 {
		return
	}
	_, _ = notification.CreateSafeNotification(h.db, domain.Notification{
		UserID:    userID,
		Title:     title,
		Message:   message,
		Type:      kind,
		Link:      link,
		CreatedAt: time.Now().UTC(),
	})
}

func (h *Handler) activeAdminCount() int64 {
	var n int64
	h.db.Model(&domain.User{}).Where("role = ?", domain.RoleAdmin).Count(&n)
	return n
}

// ---------- user filters ----------

func applyUserFilter(tx *gorm.DB, filter string, now time.Time) *gorm.DB {
	switch filter {
	case "vip":
		return tx.Where("role <> ? AND membership = ? AND (vip_expires_at IS NULL OR vip_expires_at > ?)", domain.RoleAdmin, domain.MembershipVIP, now)
	case "free":
		return tx.Where("role <> ? AND (membership <> ? OR (vip_expires_at IS NOT NULL AND vip_expires_at <= ?))", domain.RoleAdmin, domain.MembershipVIP, now)
	case "expiring":
		return tx.Where("role <> ? AND membership = ? AND vip_expires_at IS NOT NULL AND vip_expires_at > ? AND vip_expires_at <= ?",
			domain.RoleAdmin, domain.MembershipVIP, now, now.Add(7*24*time.Hour))
	case "admin":
		return tx.Where("role = ?", domain.RoleAdmin)
	case "banned":
		return tx.Where("is_banned = ?", true)
	}
	return tx
}

type userRow struct {
	domain.User
	VIPActive     bool  `json:"vipActive"`
	DaysRemaining int   `json:"daysRemaining"`
	ListenSeconds int64 `json:"listenSeconds"`
}

func (h *Handler) ListUsers(c *gin.Context) {
	page, size := pageParams(c)
	now := time.Now().UTC()
	filter := c.DefaultQuery("filter", "all")
	q := strings.TrimSpace(c.Query("q"))

	base := func() *gorm.DB { return h.db.Model(&domain.User{}).Where("is_guest = ?", false) }

	tx := applyUserFilter(base(), filter, now)
	if q != "" {
		if id, err := strconv.ParseUint(q, 10, 32); err == nil {
			tx = tx.Where("id = ? OR LOWER(username) LIKE ? OR LOWER(email) LIKE ?", id, like(q), like(q))
		} else {
			tx = tx.Where("LOWER(username) LIKE ? OR LOWER(email) LIKE ?", like(q), like(q))
		}
	}

	var total int64
	if err := tx.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		response.Internal(c, "KhÃ´ng thá»ƒ táº£i danh sÃ¡ch ngÆ°á»i dÃ¹ng")
		return
	}

	order := "created_at DESC"
	switch c.Query("sort") {
	case "oldest":
		order = "created_at ASC"
	case "name":
		order = "username ASC"
	case "active":
		order = "last_login_at DESC, created_at DESC"
	case "expiry":
		order = "CASE WHEN vip_expires_at IS NULL THEN 1 ELSE 0 END ASC, vip_expires_at ASC"
	}

	var users []domain.User
	if err := tx.Order(order).Offset((page - 1) * size).Limit(size).Find(&users).Error; err != nil {
		response.Internal(c, "KhÃ´ng thá»ƒ táº£i danh sÃ¡ch ngÆ°á»i dÃ¹ng")
		return
	}

	ids := make([]uint, 0, len(users))
	for _, u := range users {
		ids = append(ids, u.ID)
	}
	secs := map[uint]int64{}
	if len(ids) > 0 {
		var rows []struct {
			UserID uint
			Secs   int64
		}
		h.db.Model(&domain.ListeningHistory{}).
			Select("user_id, COALESCE(SUM(duration_listened), 0) AS secs").
			Where("user_id IN ?", ids).Group("user_id").Scan(&rows)
		for _, r := range rows {
			secs[r.UserID] = r.Secs
		}
	}

	items := make([]userRow, 0, len(users))
	for _, u := range users {
		items = append(items, userRow{
			User:          u,
			VIPActive:     isVIPActive(u, now),
			DaysRemaining: daysLeft(u, now),
			ListenSeconds: secs[u.ID],
		})
	}

	counts := map[string]int64{}
	for _, f := range []string{"all", "vip", "free", "expiring", "admin", "banned"} {
		var n int64
		applyUserFilter(base(), f, now).Count(&n)
		counts[f] = n
	}

	response.OK(c, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": size,
		"counts":   counts,
	}, nil)
}

func (h *Handler) GetUser(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	var u domain.User
	if err := h.db.First(&u, id).Error; err != nil {
		response.NotFound(c, "KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng")
		return
	}
	now := time.Now().UTC()

	var listenSecs int64
	h.db.Model(&domain.ListeningHistory{}).Where("user_id = ?", id).
		Select("COALESCE(SUM(duration_listened), 0)").Scan(&listenSecs)
	var plays, favorites, uploads, messages, ordersCount, paidTotal int64
	h.db.Model(&domain.ListeningHistory{}).Where("user_id = ?", id).Count(&plays)
	h.db.Model(&domain.Favorite{}).Where("user_id = ?", id).Count(&favorites)
	h.db.Model(&domain.Audio{}).Where("created_by = ?", id).Count(&uploads)
	h.db.Model(&domain.CommunityMessage{}).Where("user_id = ?", id).Count(&messages)
	h.db.Model(&domain.MembershipOrder{}).Where("user_id = ?", id).Count(&ordersCount)
	h.db.Model(&domain.MembershipOrder{}).Where("user_id = ? AND status = ?", id, "PAID").
		Select("COALESCE(SUM(amount), 0)").Scan(&paidTotal)

	var orders []domain.MembershipOrder
	h.db.Omit("qr_code_data").Where("user_id = ?", id).Order("created_at DESC").Limit(10).Find(&orders)

	var history []domain.ListeningHistory
	h.db.Preload("Audio").Preload("Episode").Where("user_id = ?", id).Order("created_at DESC").Limit(10).Find(&history)
	recent := make([]gin.H, 0, len(history))
	for _, hi := range history {
		title := "Audio Ä‘Ã£ xÃ³a"
		if hi.Audio != nil {
			title = hi.Audio.Title
		}
		ep := 0
		if hi.Episode != nil {
			ep = hi.Episode.EpisodeNumber
		}
		recent = append(recent, gin.H{
			"audioId":          hi.AudioID,
			"title":            title,
			"episodeNumber":    ep,
			"durationListened": hi.DurationListened,
			"createdAt":        hi.CreatedAt,
		})
	}

	response.OK(c, gin.H{
		"user":          u,
		"vipActive":     isVIPActive(u, now),
		"daysRemaining": daysLeft(u, now),
		"stats": gin.H{
			"listenSeconds": listenSecs,
			"plays":         plays,
			"favorites":     favorites,
			"uploads":       uploads,
			"messages":      messages,
			"orders":        ordersCount,
			"paidTotal":     paidTotal,
		},
		"orders":  orders,
		"history": recent,
	}, nil)
}

type createUserReq struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func (h *Handler) CreateUser(c *gin.Context) {
	var req createUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	if len(req.Username) < 3 || len(req.Username) > 50 {
		response.BadRequest(c, "TÃªn tÃ i khoáº£n pháº£i tá»« 3 Ä‘áº¿n 50 kÃ½ tá»±")
		return
	}
	if len(req.Password) < 6 {
		response.BadRequest(c, "Máº­t kháº©u pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±")
		return
	}
	role := domain.RoleUser
	membership := domain.MembershipFree
	var vipExpiry *time.Time
	switch strings.ToUpper(strings.TrimSpace(req.Role)) {
	case domain.RoleAdmin:
		role = domain.RoleAdmin
	case domain.RoleVIP:
		role = domain.RoleVIP
		membership = domain.MembershipVIP
		exp := time.Now().UTC().Add(30 * 24 * time.Hour)
		vipExpiry = &exp
	}
	if req.Email == "" {
		req.Email = fmt.Sprintf("%s_%d@user.local", strings.ReplaceAll(req.Username, "@", "_"), time.Now().UnixNano()%1000000)
	}
	var n int64
	h.db.Model(&domain.User{}).Where("username = ? OR email = ?", req.Username, req.Email).Count(&n)
	if n > 0 {
		response.BadRequest(c, "Tên tài khoản hoặc email đã tồn tại")
		return
	}
	hash, err := hashPassword(req.Password)
	if err != nil {
		response.Internal(c, "Lỗi mã hóa mật khẩu")
		return
	}
	u := domain.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         role,
		Membership:   membership,
		VipExpiresAt: vipExpiry,
	}
	if err := h.db.Create(&u).Error; err != nil {
		response.Internal(c, "Không thể tạo tài khoản: "+err.Error())
		return
	}
	h.audit(c, "create_user", "user", fmt.Sprint(u.ID), u.Username, u.Role)
	response.Created(c, u)
}

type updateUserReq struct {
	Username *string `json:"username"`
	Email    *string `json:"email"`
	Role     *string `json:"role"`
}

func (h *Handler) UpdateUser(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	var req updateUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡")
		return
	}
	var u domain.User
	if err := h.db.First(&u, id).Error; err != nil {
		response.NotFound(c, "KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng")
		return
	}
	updates := map[string]interface{}{}

	if req.Username != nil {
		name := strings.TrimSpace(*req.Username)
		if len(name) < 3 || len(name) > 50 {
			response.BadRequest(c, "TÃªn tÃ i khoáº£n pháº£i tá»« 3 Ä‘áº¿n 50 kÃ½ tá»±")
			return
		}
		if name != u.Username {
			var n int64
			h.db.Model(&domain.User{}).Where("username = ? AND id <> ?", name, id).Count(&n)
			if n > 0 {
				response.BadRequest(c, "TÃªn tÃ i khoáº£n Ä‘Ã£ tá»“n táº¡i")
				return
			}
			updates["username"] = name
		}
	}
	if req.Email != nil {
		email := strings.TrimSpace(*req.Email)
		if email == "" {
			synthetic := fmt.Sprintf("%s_%d@user.local", strings.ReplaceAll(u.Username, "@", "_"), time.Now().UnixNano()%1000000)
			updates["email"] = synthetic
		} else if email != u.Email {
			var n int64
			h.db.Model(&domain.User{}).Where("email = ? AND id <> ?", email, id).Count(&n)
			if n > 0 {
				response.BadRequest(c, "Email đã được sử dụng")
				return
			}
			updates["email"] = email
		}
	}
	if req.Role != nil {
		role := strings.ToUpper(strings.TrimSpace(*req.Role))
		if role != domain.RoleAdmin && role != domain.RoleUser && role != domain.RoleVIP {
			response.BadRequest(c, "Vai trò chỉ gồm USER, VIP hoặc ADMIN")
			return
		}
		if role != u.Role {
			if u.Role == domain.RoleAdmin {
				if middleware.GetCurrentUserID(c) == id {
					response.BadRequest(c, "Không thể tự hạ quyền tài khoản đang đăng nhập")
					return
				}
				if h.activeAdminCount() <= 1 {
					response.BadRequest(c, "Hệ thống phải còn ít nhất một quản trị viên")
					return
				}
			}
			switch role {
			case domain.RoleAdmin:
				if u.IsBanned {
					response.BadRequest(c, "Hãy mở khóa tài khoản trước khi cấp quyền quản trị")
					return
				}
				updates["role"] = domain.RoleAdmin
			case domain.RoleVIP:
				now := time.Now().UTC()
				updates["role"] = domain.RoleVIP
				updates["membership"] = domain.MembershipVIP
				if u.VipExpiresAt == nil || !u.VipExpiresAt.After(now) {
					exp := now.Add(30 * 24 * time.Hour)
					updates["vip_expires_at"] = &exp
				}
			default:
				updates["role"] = domain.RoleUser
				updates["membership"] = domain.MembershipFree
				updates["vip_expires_at"] = nil
			}
		}
	}
	if len(updates) > 0 {
		if err := h.db.Model(&domain.User{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			response.Internal(c, "Không thể cập nhật người dùng")
			return
		}
		middleware.InvalidateUserAuth(id)
		h.audit(c, "update_user", "user", fmt.Sprint(id), u.Username, fmt.Sprintf("%d trường", len(updates)))
	}
	h.db.First(&u, id)
	response.OK(c, u, nil)
}

// ---------- user operations (shared by single + bulk) ----------

var errNotFound = errors.New("khÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng")

func (h *Handler) grantVIP(id uint, days int) error {
	if days < 1 || days > 3650 {
		return errors.New("sá»‘ ngÃ y VIP pháº£i tá»« 1 Ä‘áº¿n 3650")
	}
	var u domain.User
	if err := h.db.First(&u, id).Error; err != nil {
		return errNotFound
	}
	now := time.Now().UTC()
	base := now
	if u.VipExpiresAt != nil && u.VipExpiresAt.After(now) {
		base = *u.VipExpiresAt
	}
	expiry := base.Add(time.Duration(days) * 24 * time.Hour)
	role := domain.RoleVIP
	if u.Role == domain.RoleAdmin {
		role = domain.RoleAdmin
	}
	if err := h.db.Model(&domain.User{}).Where("id = ?", id).Updates(map[string]interface{}{
		"role":           role,
		"membership":     domain.MembershipVIP,
		"vip_expires_at": &expiry,
	}).Error; err != nil {
		return err
	}
	middleware.InvalidateUserAuth(id)
	h.notify(id, "Báº¡n Ä‘Ã£ Ä‘Æ°á»£c cáº¥p VIP",
		fmt.Sprintf("Quáº£n trá»‹ viÃªn Ä‘Ã£ cáº¥p %d ngÃ y VIP cho báº¡n. Háº¡n dÃ¹ng Ä‘áº¿n %s.", days, expiry.Format("02/01/2006")),
		"/profile", "VIP")
	return nil
}

func (h *Handler) revokeVIP(id uint) error {
	var u domain.User
	if err := h.db.First(&u, id).Error; err != nil {
		return errNotFound
	}
	role := domain.RoleUser
	if u.Role == domain.RoleAdmin {
		role = domain.RoleAdmin
	}
	err := h.db.Model(&domain.User{}).Where("id = ?", id).Updates(map[string]interface{}{
		"role":           role,
		"membership":     domain.MembershipFree,
		"vip_expires_at": nil,
	}).Error
	if err == nil {
		middleware.InvalidateUserAuth(id)
	}
	return err
}

func (h *Handler) setBan(actor, id uint, banned bool, reason string) error {
	var u domain.User
	if err := h.db.First(&u, id).Error; err != nil {
		return errNotFound
	}
	if banned {
		if id == actor {
			return errors.New("khÃ´ng thá»ƒ tá»± khÃ³a tÃ i khoáº£n Ä‘ang Ä‘Äƒng nháº­p")
		}
		if u.Role == domain.RoleAdmin {
			return errors.New("khÃ´ng thá»ƒ khÃ³a quáº£n trá»‹ viÃªn. HÃ£y háº¡ quyá»n trÆ°á»›c")
		}
		now := time.Now().UTC()
		if err := h.db.Model(&domain.User{}).Where("id = ?", id).Updates(map[string]interface{}{
			"is_banned":  true,
			"ban_reason": strings.TrimSpace(reason),
			"banned_at":  &now,
		}).Error; err != nil {
			return err
		}
		middleware.SetBanned(id, true)
		return nil
	}
	if err := h.db.Model(&domain.User{}).Where("id = ?", id).Updates(map[string]interface{}{
		"is_banned":  false,
		"ban_reason": "",
		"banned_at":  nil,
	}).Error; err != nil {
		return err
	}
	middleware.SetBanned(id, false)
	return nil
}

func (h *Handler) removeUser(actor, id uint) error {
	var u domain.User
	if err := h.db.First(&u, id).Error; err != nil {
		return errNotFound
	}
	if id == actor {
		return errors.New("khÃ´ng thá»ƒ tá»± xÃ³a tÃ i khoáº£n Ä‘ang Ä‘Äƒng nháº­p")
	}
	if u.Role == domain.RoleAdmin {
		return errors.New("khÃ´ng thá»ƒ xÃ³a quáº£n trá»‹ viÃªn. HÃ£y háº¡ quyá»n trÆ°á»›c")
	}
	err := h.db.Transaction(func(tx *gorm.DB) error {
		for _, stmt := range []string{
			"DELETE FROM listening_progress WHERE user_id = ?",
			"DELETE FROM listening_history WHERE user_id = ?",
			"DELETE FROM favorites WHERE user_id = ?",
			"DELETE FROM notifications WHERE user_id = ?",
			"DELETE FROM notification_preferences WHERE user_id = ?",
		} {
			if err := tx.Exec(stmt, id).Error; err != nil {
				return err
			}
		}
		return tx.Delete(&domain.User{}, id).Error
	})
	if err == nil {
		middleware.SetBanned(id, false)
		middleware.InvalidateUserAuth(id)
	}
	return err
}

func (h *Handler) GrantVIP(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	var req struct {
		Days int `json:"days"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Sá»‘ ngÃ y khÃ´ng há»£p lá»‡")
		return
	}
	if err := h.grantVIP(id, req.Days); err != nil {
		response.BadRequest(c, capitalize(err.Error()))
		return
	}
	h.audit(c, "grant_vip", "user", fmt.Sprint(id), "", fmt.Sprintf("+%d ngày", req.Days))
	h.respondUser(c, id)
}

func (h *Handler) RevokeVIP(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	if err := h.revokeVIP(id); err != nil {
		response.BadRequest(c, capitalize(err.Error()))
		return
	}
	h.audit(c, "revoke_vip", "user", fmt.Sprint(id), "", "Thu hồi VIP")
	h.respondUser(c, id)
}

func (h *Handler) BanUser(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)
	if err := h.setBan(middleware.GetCurrentUserID(c), id, true, req.Reason); err != nil {
		response.BadRequest(c, capitalize(err.Error()))
		return
	}
	h.audit(c, "ban_user", "user", fmt.Sprint(id), "", req.Reason)
	h.respondUser(c, id)
}

func (h *Handler) UnbanUser(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	if err := h.setBan(middleware.GetCurrentUserID(c), id, false, ""); err != nil {
		response.BadRequest(c, capitalize(err.Error()))
		return
	}
	h.audit(c, "unban_user", "user", fmt.Sprint(id), "", "")
	h.respondUser(c, id)
}

func (h *Handler) DeleteUser(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	if err := h.removeUser(middleware.GetCurrentUserID(c), id); err != nil {
		response.BadRequest(c, capitalize(err.Error()))
		return
	}
	h.audit(c, "delete_user", "user", fmt.Sprint(id), "", "")
	response.OK(c, gin.H{"deletedId": id}, nil)
}

func (h *Handler) respondUser(c *gin.Context, id uint) {
	var u domain.User
	if err := h.db.First(&u, id).Error; err != nil {
		response.NotFound(c, "KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng")
		return
	}
	now := time.Now().UTC()
	response.OK(c, userRow{User: u, VIPActive: isVIPActive(u, now), DaysRemaining: daysLeft(u, now)}, nil)
}

func (h *Handler) ResetPassword(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Password) < 6 {
		response.BadRequest(c, "Máº­t kháº©u má»›i pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±")
		return
	}
	hash, err := hashPassword(req.Password)
	if err != nil {
		response.Internal(c, "Lá»—i mÃ£ hÃ³a máº­t kháº©u")
		return
	}
	res := h.db.Model(&domain.User{}).Where("id = ?", id).Update("password_hash", hash)
	if res.Error != nil || res.RowsAffected == 0 {
		response.NotFound(c, "KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng")
		return
	}
	h.audit(c, "reset_password", "user", fmt.Sprint(id), "", "Đặt lại mật khẩu")
	response.OK(c, gin.H{"id": id}, nil)
}

func (h *Handler) NotifyUser(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	var req struct {
		Title   string `json:"title"`
		Message string `json:"message"`
		Link    string `json:"link"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡")
		return
	}
	req.Title, req.Message = strings.TrimSpace(req.Title), strings.TrimSpace(req.Message)
	if req.Title == "" || req.Message == "" {
		response.BadRequest(c, "Vui lÃ²ng nháº­p tiÃªu Ä‘á» vÃ  ná»™i dung")
		return
	}
	var n int64
	h.db.Model(&domain.User{}).Where("id = ?", id).Count(&n)
	if n == 0 {
		response.NotFound(c, "KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng")
		return
	}
	_, _ = notification.CreateBatchNotifications(h.db, []uint{id}, truncate(req.Title, 200), truncate(req.Message, 1000), "SYSTEM", truncate(strings.TrimSpace(req.Link), 255))
	h.audit(c, "notify_user", "user", fmt.Sprint(id), "", truncate(req.Title, 80))
	response.OK(c, gin.H{"id": id}, nil)
}

func (h *Handler) BulkUsers(c *gin.Context) {
	var req struct {
		IDs    []uint `json:"ids"`
		Action string `json:"action"`
		Days   int    `json:"days"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		response.BadRequest(c, "ChÆ°a chá»n ngÆ°á»i dÃ¹ng nÃ o")
		return
	}
	if len(req.IDs) > 200 {
		response.BadRequest(c, "Tá»‘i Ä‘a 200 ngÆ°á»i dÃ¹ng má»—i láº§n")
		return
	}
	actor := middleware.GetCurrentUserID(c)
	ok, failed := 0, 0
	var firstErr string
	for _, id := range req.IDs {
		var err error
		switch req.Action {
		case "ban":
			err = h.setBan(actor, id, true, req.Reason)
		case "unban":
			err = h.setBan(actor, id, false, "")
		case "delete":
			err = h.removeUser(actor, id)
		case "grant_vip":
			err = h.grantVIP(id, req.Days)
		case "revoke_vip":
			err = h.revokeVIP(id)
		default:
			response.BadRequest(c, "Thao tÃ¡c khÃ´ng há»£p lá»‡")
			return
		}
		if err != nil {
			failed++
			if firstErr == "" {
				firstErr = capitalize(err.Error())
			}
			continue
		}
		ok++
	}
	if ok > 0 {
		h.audit(c, "bulk_users_"+req.Action, "user", fmt.Sprintf("%d", ok), "", fmt.Sprintf("success=%d failed=%d", ok, failed))
	}
	response.OK(c, gin.H{"success": ok, "failed": failed, "error": firstErr}, nil)
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	r[0] = []rune(strings.ToUpper(string(r[0])))[0]
	return string(r)
}
