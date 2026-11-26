package admin

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type orderRow struct {
	domain.MembershipOrder
	Username string `json:"username"`
	Email    string `json:"email"`
}

func (h *Handler) ListOrders(c *gin.Context) {
	page, size := pageParams(c)
	status := strings.ToUpper(strings.TrimSpace(c.DefaultQuery("status", "ALL")))
	q := strings.TrimSpace(c.Query("q"))

	tx := h.db.Model(&domain.MembershipOrder{})
	if status != "ALL" && status != "" {
		tx = tx.Where("status = ?", status)
	}
	if q != "" {
		tx = tx.Where("order_code LIKE ? OR LOWER(package_name) LIKE ? OR user_id IN (SELECT id FROM users WHERE LOWER(username) LIKE ? OR LOWER(email) LIKE ?)",
			"%"+q+"%", like(q), like(q), like(q))
	}

	var total int64
	tx.Session(&gorm.Session{}).Count(&total)

	var orders []domain.MembershipOrder
	if err := tx.Omit("qr_code_data").Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&orders).Error; err != nil {
		response.Internal(c, "Không thể tải danh sách đơn hàng")
		return
	}

	ids := make([]uint, 0, len(orders))
	for _, o := range orders {
		ids = append(ids, o.UserID)
	}
	names := map[uint]domain.User{}
	if len(ids) > 0 {
		var us []domain.User
		h.db.Select("id, username, email").Where("id IN ?", ids).Find(&us)
		for _, u := range us {
			names[u.ID] = u
		}
	}
	items := make([]orderRow, 0, len(orders))
	for _, o := range orders {
		u := names[o.UserID]
		name := u.Username
		if name == "" {
			name = "Tài khoản đã xóa"
		}
		items = append(items, orderRow{MembershipOrder: o, Username: name, Email: u.Email})
	}

	now := time.Now().UTC()
	sumPaid := func(since *time.Time) int64 {
		var v int64
		t := h.db.Model(&domain.MembershipOrder{}).Where("status = ?", "PAID")
		if since != nil {
			t = t.Where("paid_at >= ?", *since)
		}
		t.Select("COALESCE(SUM(amount), 0)").Scan(&v)
		return v
	}
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	last30 := now.Add(-30 * 24 * time.Hour)
	counts := map[string]int64{}
	var grouped []struct {
		Status string
		N      int64
	}
	h.db.Model(&domain.MembershipOrder{}).Select("status, COUNT(*) AS n").Group("status").Scan(&grouped)
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
		"revenue": gin.H{
			"total":  sumPaid(nil),
			"last30": sumPaid(&last30),
			"today":  sumPaid(&startOfDay),
		},
	}, nil)
}

func (h *Handler) findOrder(c *gin.Context) (domain.MembershipOrder, bool) {
	var o domain.MembershipOrder
	if err := h.db.Where("order_code = ?", c.Param("code")).First(&o).Error; err != nil {
		response.NotFound(c, "Không tìm thấy đơn hàng")
		return o, false
	}
	return o, true
}

func (h *Handler) ConfirmOrder(c *gin.Context) {
	o, ok := h.findOrder(c)
	if !ok {
		return
	}
	if o.Status == "PAID" || o.Status == "REFUNDED" {
		response.BadRequest(c, "Đơn hàng đã được xử lý")
		return
	}
	now := time.Now().UTC()
	err := h.db.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&domain.MembershipOrder{}).
			Where("id = ? AND status NOT IN ?", o.ID, []string{"PAID", "REFUNDED"}).
			Updates(map[string]interface{}{"status": "PAID", "paid_at": &now})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errors.New("đơn hàng đã được xử lý")
		}
		var u domain.User
		if err := tx.First(&u, o.UserID).Error; err != nil {
			return errors.New("tài khoản của đơn hàng không còn tồn tại")
		}
		base := now
		if u.VipExpiresAt != nil && u.VipExpiresAt.After(now) {
			base = *u.VipExpiresAt
		}
		expiry := base.Add(time.Duration(o.DurationDays) * 24 * time.Hour)
		role := domain.RoleVIP
		if u.Role == domain.RoleAdmin {
			role = domain.RoleAdmin
		}
		return tx.Model(&domain.User{}).Where("id = ?", u.ID).Updates(map[string]interface{}{
			"role":           role,
			"membership":     domain.MembershipVIP,
			"vip_expires_at": &expiry,
		}).Error
	})
	if err != nil {
		response.BadRequest(c, capitalize(err.Error()))
		return
	}
	h.notify(o.UserID, "Thanh toán đã được xác nhận",
		fmt.Sprintf("Đơn hàng #%s (%s) đã được xác nhận. Quyền lợi VIP đã được kích hoạt.", o.OrderCode, o.PackageName),
		"/profile", "VIP")
	h.audit(c, "confirm_order", "order", o.OrderCode, o.PackageName, fmt.Sprintf("%dđ", o.Amount))
	h.db.Omit("qr_code_data").First(&o, o.ID)
	response.OK(c, o, nil)
}

func (h *Handler) CancelOrder(c *gin.Context) {
	o, ok := h.findOrder(c)
	if !ok {
		return
	}
	if o.Status != "PENDING" {
		response.BadRequest(c, "Chỉ hủy được đơn đang chờ thanh toán")
		return
	}
	h.db.Model(&domain.MembershipOrder{}).Where("id = ?", o.ID).Update("status", "CANCELLED")
	h.audit(c, "cancel_order", "order", o.OrderCode, o.PackageName, "")
	o.Status = "CANCELLED"
	response.OK(c, o, nil)
}

func (h *Handler) RefundOrder(c *gin.Context) {
	o, ok := h.findOrder(c)
	if !ok {
		return
	}
	if o.Status != "PAID" {
		response.BadRequest(c, "Chỉ hoàn tiền được đơn đã thanh toán")
		return
	}
	now := time.Now().UTC()
	err := h.db.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&domain.MembershipOrder{}).Where("id = ? AND status = ?", o.ID, "PAID").Update("status", "REFUNDED")
		if res.Error != nil || res.RowsAffected == 0 {
			return errors.New("đơn hàng đã được xử lý")
		}
		var u domain.User
		if err := tx.First(&u, o.UserID).Error; err != nil {
			return nil
		}
		if u.VipExpiresAt == nil {
			return nil
		}
		expiry := u.VipExpiresAt.Add(-time.Duration(o.DurationDays) * 24 * time.Hour)
		if expiry.After(now) {
			return tx.Model(&domain.User{}).Where("id = ?", u.ID).Update("vip_expires_at", &expiry).Error
		}
		role := domain.RoleUser
		if u.Role == domain.RoleAdmin {
			role = domain.RoleAdmin
		}
		return tx.Model(&domain.User{}).Where("id = ?", u.ID).Updates(map[string]interface{}{
			"role":           role,
			"membership":     domain.MembershipFree,
			"vip_expires_at": nil,
		}).Error
	})
	if err != nil {
		response.BadRequest(c, capitalize(err.Error()))
		return
	}
	h.notify(o.UserID, "Đơn hàng đã được hoàn tiền",
		fmt.Sprintf("Đơn hàng #%s (%s) đã được hoàn tiền. Thời hạn VIP tương ứng đã được điều chỉnh.", o.OrderCode, o.PackageName),
		"/membership", "SYSTEM")
	h.audit(c, "refund_order", "order", o.OrderCode, o.PackageName, fmt.Sprintf("%dđ", o.Amount))
	o.Status = "REFUNDED"
	response.OK(c, o, nil)
}
