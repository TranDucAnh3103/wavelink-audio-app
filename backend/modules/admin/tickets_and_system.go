package admin

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *Handler) audit(c *gin.Context, action, targetType, targetID, targetName, detail string) {
	adminID := middleware.GetCurrentUserID(c)
	adminName := ""
	if v, ok := c.Get("username"); ok {
		if s, ok := v.(string); ok {
			adminName = s
		}
	}
	if adminName == "" {
		adminName = fmt.Sprintf("Admin#%d", adminID)
	}
	_ = h.db.Create(&domain.AdminAuditLog{
		AdminID:    adminID,
		AdminName:  adminName,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		TargetName: truncate(targetName, 200),
		Detail:     truncate(detail, 1000),
		CreatedAt:  time.Now().UTC(),
	}).Error
}

// ---------- Support Tickets (Hoàn tiền & Khiếu nại) ----------

func (h *Handler) ListTickets(c *gin.Context) {
	page, size := pageParams(c)
	status := strings.ToUpper(strings.TrimSpace(c.DefaultQuery("status", "ALL")))
	kind := strings.ToUpper(strings.TrimSpace(c.DefaultQuery("kind", "ALL")))
	q := strings.TrimSpace(c.Query("q"))

	tx := h.db.Model(&domain.SupportTicket{})
	if status != "" && status != "ALL" {
		tx = tx.Where("status = ?", status)
	}
	if kind != "" && kind != "ALL" {
		tx = tx.Where("kind = ?", kind)
	}
	if q != "" {
		tx = tx.Where("LOWER(username) LIKE ? OR LOWER(subject) LIKE ? OR LOWER(order_code) LIKE ?", like(q), like(q), like(q))
	}

	var total int64
	tx.Session(&gorm.Session{}).Count(&total)

	var items []domain.SupportTicket
	if err := tx.Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&items).Error; err != nil {
		response.Internal(c, "Không thể tải danh sách yêu cầu")
		return
	}

	counts := map[string]int64{}
	var grouped []struct {
		Status string
		N      int64
	}
	h.db.Model(&domain.SupportTicket{}).Select("status, COUNT(*) AS n").Group("status").Scan(&grouped)
	var all int64
	for _, g := range grouped {
		counts[g.Status] = g.N
		all += g.N
	}
	counts["ALL"] = all

	response.OK(c, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": size,
		"counts":   counts,
	}, nil)
}

func (h *Handler) UpdateTicket(c *gin.Context) {
	id, ok := paramID(c)
	if !ok {
		return
	}
	var req struct {
		Status    string `json:"status"`
		AdminNote string `json:"adminNote"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu không hợp lệ")
		return
	}

	var ticket domain.SupportTicket
	if err := h.db.First(&ticket, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy yêu cầu")
		return
	}

	status := strings.ToUpper(strings.TrimSpace(req.Status))
	switch status {
	case "PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED":
	case "":
		status = ticket.Status
	default:
		response.BadRequest(c, "Trạng thái không hợp lệ")
		return
	}

	now := time.Now().UTC()
	updates := map[string]interface{}{
		"status":     status,
		"admin_note": strings.TrimSpace(req.AdminNote),
		"updated_at": now,
	}
	if status == "RESOLVED" || status == "REJECTED" {
		updates["resolved_by"] = middleware.GetCurrentUserID(c)
		updates["resolved_at"] = &now
	} else {
		updates["resolved_by"] = 0
		updates["resolved_at"] = nil
	}

	if err := h.db.Model(&ticket).Updates(updates).Error; err != nil {
		response.Internal(c, "Không thể cập nhật yêu cầu")
		return
	}

	if status == "RESOLVED" || status == "REJECTED" {
		label := "đã được giải quyết"
		if status == "REJECTED" {
			label = "đã bị từ chối"
		}
		msg := fmt.Sprintf("Yêu cầu '%s' của bạn %s.", ticket.Subject, label)
		if note := strings.TrimSpace(req.AdminNote); note != "" {
			msg += " Phản hồi: " + note
		}
		h.notify(ticket.UserID, "Cập nhật yêu cầu hỗ trợ", msg, "/notifications", "SYSTEM")
	}

	h.audit(c, "ticket_update", "ticket", fmt.Sprint(ticket.ID), ticket.Subject, status)
	h.db.First(&ticket, id)
	response.OK(c, ticket, nil)
}

// ---------- Audit Logs ----------

func (h *Handler) ListAuditLogs(c *gin.Context) {
	page, size := pageParams(c)
	q := strings.TrimSpace(c.Query("q"))

	tx := h.db.Model(&domain.AdminAuditLog{})
	if q != "" {
		tx = tx.Where("LOWER(admin_name) LIKE ? OR LOWER(action) LIKE ? OR LOWER(target_name) LIKE ? OR LOWER(detail) LIKE ?",
			like(q), like(q), like(q), like(q))
	}

	var total int64
	tx.Session(&gorm.Session{}).Count(&total)

	var items []domain.AdminAuditLog
	if err := tx.Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&items).Error; err != nil {
		response.Internal(c, "Không thể tải nhật ký quản trị")
		return
	}

	response.OK(c, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": size,
	}, nil)
}

// ---------- Dynamic System Settings ----------

func (h *Handler) readSiteConfig() domain.SiteConfig {
	return middleware.GetSiteConfig(h.db)
}

func (h *Handler) GetSettings(c *gin.Context) {
	response.OK(c, h.readSiteConfig(), nil)
}

func (h *Handler) UpdateSettings(c *gin.Context) {
	var req domain.SiteConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Cấu hình không hợp lệ")
		return
	}
	if req.FreeImportDailyLimit < 1 || req.FreeImportDailyLimit > 1000 {
		response.BadRequest(c, "Hạn mức import/ngày phải từ 1 đến 1000")
		return
	}
	req.MaintenanceMessage = strings.TrimSpace(req.MaintenanceMessage)

	raw, err := json.Marshal(req)
	if err != nil {
		response.Internal(c, "Không thể mã hóa cấu hình")
		return
	}
	now := time.Now().UTC()
	var existing domain.SystemSetting
	if err := h.db.Session(&gorm.Session{}).Where("`key` = ?", "site_config").Take(&existing).Error; err == nil {
		h.db.Model(&domain.SystemSetting{}).Where("`key` = ?", "site_config").Updates(map[string]interface{}{"value": string(raw), "updated_at": now})
	} else {
		h.db.Create(&domain.SystemSetting{Key: "site_config", Value: string(raw), UpdatedAt: now})
	}

	middleware.InvalidateSiteConfigCache()
	h.audit(c, "settings_update", "system", "site_config", "Cấu hình hệ thống",
		fmt.Sprintf("limit=%d userImport=%v guestChat=%v maintenance=%v", req.FreeImportDailyLimit, req.AllowUserImport, req.AllowGuestChat, req.MaintenanceMode))
	response.OK(c, req, nil)
}

// ---------- Stream Cache & Extractor Status ----------

func (h *Handler) GetStreamStatus(c *gin.Context) {
	cacheEntries := 0
	if h.streamCache != nil {
		cacheEntries = h.streamCache.Len()
	}
	var okCount, failCount, unknownCount int64
	h.db.Model(&domain.Audio{}).Where("stream_status = ?", domain.StreamStatusOK).Count(&okCount)
	h.db.Model(&domain.Audio{}).Where("stream_status = ?", domain.StreamStatusFailed).Count(&failCount)
	h.db.Model(&domain.Audio{}).Where("stream_status = ? OR stream_status = '' OR stream_status IS NULL", domain.StreamStatusUnknown).Count(&unknownCount)

	response.OK(c, gin.H{
		"extractorReady": h.streamExtractor != nil,
		"cacheEntries":   cacheEntries,
		"streamOK":       okCount,
		"streamFailed":   failCount,
		"streamUnknown":  unknownCount,
	}, nil)
}

func (h *Handler) ClearStreamCache(c *gin.Context) {
	var req struct {
		VideoID string `json:"videoId"`
	}
	_ = c.ShouldBindJSON(&req)
	if h.streamCache == nil {
		response.OK(c, gin.H{"cleared": 0}, nil)
		return
	}
	vid := strings.TrimSpace(req.VideoID)
	if vid != "" {
		h.streamCache.Invalidate(vid)
		h.audit(c, "clear_stream_cache", "stream", vid, vid, "Xóa cache 1 video")
		response.OK(c, gin.H{"cleared": 1}, nil)
		return
	}
	n := h.streamCache.ClearAll()
	h.audit(c, "clear_stream_cache", "stream", "all", "Toàn bộ cache", fmt.Sprintf("%d mục", n))
	response.OK(c, gin.H{"cleared": n}, nil)
}

// ---------- CSV Exports ----------

func (h *Handler) ExportUsersCSV(c *gin.Context) {
	var users []domain.User
	h.db.Where("is_guest = ?", false).Order("id ASC").Find(&users)

	var buf bytes.Buffer
	buf.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM for Excel
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"ID", "Username", "Email", "Role", "Membership", "VipExpiresAt", "Banned", "BanReason", "LastLoginAt", "CreatedAt"})
	for _, u := range users {
		exp := ""
		if u.VipExpiresAt != nil {
			exp = u.VipExpiresAt.Format(time.RFC3339)
		}
		last := ""
		if u.LastLoginAt != nil {
			last = u.LastLoginAt.Format(time.RFC3339)
		}
		_ = w.Write([]string{
			strconv.FormatUint(uint64(u.ID), 10),
			u.Username,
			u.Email,
			u.Role,
			u.Membership,
			exp,
			strconv.FormatBool(u.IsBanned),
			u.BanReason,
			last,
			u.CreatedAt.Format(time.RFC3339),
		})
	}
	w.Flush()

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="wavelink-users.csv"`)
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}

func (h *Handler) ExportOrdersCSV(c *gin.Context) {
	var orders []domain.MembershipOrder
	h.db.Omit("qr_code_data").Order("created_at DESC").Find(&orders)

	ids := make([]uint, 0, len(orders))
	for _, o := range orders {
		ids = append(ids, o.UserID)
	}
	names := map[uint]string{}
	if len(ids) > 0 {
		var us []domain.User
		h.db.Select("id, username").Where("id IN ?", ids).Find(&us)
		for _, u := range us {
			names[u.ID] = u.Username
		}
	}

	var buf bytes.Buffer
	buf.Write([]byte{0xEF, 0xBB, 0xBF})
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"OrderCode", "UserID", "Username", "PackageID", "PackageName", "AmountVND", "DurationDays", "Status", "Provider", "CreatedAt", "PaidAt"})
	for _, o := range orders {
		paidAt := ""
		if o.PaidAt != nil {
			paidAt = o.PaidAt.Format(time.RFC3339)
		}
		_ = w.Write([]string{
			o.OrderCode,
			strconv.FormatUint(uint64(o.UserID), 10),
			names[o.UserID],
			o.PackageID,
			o.PackageName,
			strconv.Itoa(o.Amount),
			strconv.Itoa(o.DurationDays),
			o.Status,
			o.Provider,
			o.CreatedAt.Format(time.RFC3339),
			paidAt,
		})
	}
	w.Flush()

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="wavelink-orders.csv"`)
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}
