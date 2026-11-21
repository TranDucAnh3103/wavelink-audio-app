package membership

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"audio-app-backend/config"
	"audio-app-backend/core/domain"
	"audio-app-backend/infra/external"
	"audio-app-backend/modules/notification"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	db    *gorm.DB
	cfg   *config.Config
	payos *external.PayOSClient
}

func NewHandler(db *gorm.DB, cfg *config.Config) *Handler {
	var payosClient *external.PayOSClient
	if cfg != nil && cfg.HasPayOS() {
		payosClient = external.NewPayOSClient(cfg.PayOSClientID, cfg.PayOSAPIKey, cfg.PayOSChecksumKey)
	}
	return &Handler{db: db, cfg: cfg, payos: payosClient}
}

type VIPPackage struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Amount       int      `json:"amount"`
	PriceVND     int      `json:"priceVND"`
	DurationDays int      `json:"durationDays"`
	OriginalCost int      `json:"originalCost"`
	Discount     string   `json:"discount"`
	Description  string   `json:"description"`
	Perks        []string `json:"perks"`
	IsLocked     bool     `json:"isLocked,omitempty"`
	IsCurrent    bool     `json:"isCurrent,omitempty"`
	CanUpgrade   bool     `json:"canUpgrade,omitempty"`
}

type PaymentInfo struct {
	BankName        string `json:"bankName"`
	AccountNumber   string `json:"accountNumber"`
	AccountName     string `json:"accountName"`
	NotePrefix      string `json:"notePrefix"`
	Provider        string `json:"provider,omitempty"`
	PayOSConfigured bool   `json:"payosConfigured"`
}

func (h *Handler) GetSettingValue(key string) string {
	var s domain.SystemSetting
	if err := h.db.Session(&gorm.Session{}).Where("`key` = ?", key).Take(&s).Error; err == nil {
		return s.Value
	}
	return ""
}

func (h *Handler) GetPaymentSettings() PaymentInfo {
	payosReady := h.payos != nil && h.payos.IsConfigured()
	provider := "VIETQR_DEV"
	if payosReady {
		provider = "PAYOS"
	}

	info := PaymentInfo{
		BankName:        "MB Bank (Quân Đội)",
		AccountNumber:   "0987654321",
		AccountName:     "COMIC AUDIO HUB",
		NotePrefix:      "VIP",
		Provider:        provider,
		PayOSConfigured: payosReady,
	}

	if h.cfg != nil {
		if h.cfg.VietQRBankName != "" {
			info.BankName = h.cfg.VietQRBankName
		}
		if h.cfg.VietQRAccountNumber != "" {
			info.AccountNumber = h.cfg.VietQRAccountNumber
		}
		if h.cfg.VietQRAccountName != "" {
			info.AccountName = h.cfg.VietQRAccountName
		}
		if h.cfg.VietQRNotePrefix != "" {
			info.NotePrefix = h.cfg.VietQRNotePrefix
		}
	}

	if val := h.GetSettingValue("bank_name"); val != "" {
		info.BankName = val
	}
	if val := h.GetSettingValue("account_number"); val != "" {
		info.AccountNumber = val
	}
	if val := h.GetSettingValue("account_name"); val != "" {
		info.AccountName = val
	}
	if val := h.GetSettingValue("note_prefix"); val != "" {
		info.NotePrefix = val
	}

	return info
}

func (h *Handler) GetDynamicPackages() []VIPPackage {
	if val := h.GetSettingValue("vip_packages"); val != "" {
		var pkgs []VIPPackage
		if err := json.Unmarshal([]byte(val), &pkgs); err == nil && len(pkgs) > 0 {
			for i := range pkgs {
				pkgs[i].IsLocked = false
				pkgs[i].IsCurrent = false
				pkgs[i].CanUpgrade = false
			}
			return pkgs
		}
	}
	out := make([]VIPPackage, len(AvailablePackages))
	copy(out, AvailablePackages)
	return out
}

var AvailablePackages = []VIPPackage{
	{
		ID:           "VIP_1M",
		Name:         "Gói 1 Tháng",
		Amount:       49000,
		PriceVND:     49000,
		DurationDays: 30,
		OriginalCost: 59000,
		Discount:     "Tiết kiệm 17%",
		Description:  "Trải nghiệm toàn bộ kho truyện VIP & không giới hạn import",
		Perks: []string{
			"Mở khóa 100% truyện độc quyền VIP",
			"Không giới hạn số lượt import YouTube",
			"Đồng bộ tiến trình đám mây ưu tiên cao nhất",
			"Huy hiệu VIP Member phong cách Manga",
		},
	},
	{
		ID:           "VIP_3M",
		Name:         "Gói 3 Tháng",
		Amount:       129000,
		PriceVND:     129000,
		DurationDays: 90,
		OriginalCost: 177000,
		Discount:     "Tiết kiệm 27% (Khuyên dùng)",
		Description:  "Tiết kiệm 27% - Đồng bộ tốc độ cao",
		Perks: []string{
			"Mọi đặc quyền của gói VIP 1 Tháng",
			"Thời lượng kéo dài 90 ngày liên tục",
			"Cộng dồn thời hạn nếu đang có gói cũ",
			"Hỗ trợ ưu tiên khi gặp sự cố kỹ thuật",
		},
	},
	{
		ID:           "VIP_1Y",
		Name:         "Gói 1 Năm",
		Amount:       399000,
		PriceVND:     399000,
		DurationDays: 365,
		OriginalCost: 708000,
		Discount:     "Tiết kiệm 44% (Siêu rẻ)",
		Description:  "Tiết kiệm 44% - Đặc quyền tối cao",
		Perks: []string{
			"Toàn bộ đặc quyền cao cấp nhất của hệ thống",
			"365 ngày VIP không lo gia hạn",
			"Huy hiệu Gold VIP Độc Bản",
			"Nhận thông báo sớm nhất khi có audio bom tấn mới",
		},
	},
}

type CreateOrderRequest struct {
	PackageID string `json:"packageId" binding:"required"`
}

type SimulatePaymentRequest struct {
	Status string `json:"status" binding:"required"` // "SUCCESS" | "FAILED"
}

type CancelVipRequest struct {
	Reason string `json:"reason"`
}

type RefundRequest struct {
	OrderCode string `json:"orderCode"`
	Reason    string `json:"reason" binding:"required"`
	BankInfo  string `json:"bankInfo"`
}

type ComplaintRequest struct {
	Category string `json:"category"`
	Subject  string `json:"subject" binding:"required"`
	Content  string `json:"content" binding:"required"`
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	mem := rg.Group("/membership")
	{
		mem.GET("/packages", h.GetPackages)
		mem.GET("/payment-info", h.GetPaymentInfo)
		mem.POST("/payos/webhook", h.PayOSWebhook)
		mem.GET("/me", middleware.RequireAuth(), h.GetMyMembership)
		mem.POST("/orders", middleware.RequireAuth(), h.CreateOrder)
		mem.GET("/orders/:orderCode", middleware.RequireAuth(), h.GetOrder)
		mem.POST("/orders/:orderCode/cancel", middleware.RequireAuth(), h.CancelOrder)
		mem.POST("/orders/:orderCode/simulate", middleware.RequireAuth(), h.SimulatePayment)
		mem.POST("/cancel-vip", middleware.RequireAuth(), h.CancelVIP)
		mem.POST("/refund", middleware.RequireAuth(), h.RequestRefund)
		mem.POST("/complaint", middleware.RequireAuth(), h.SubmitComplaint)

		// Admin Routes
		admin := mem.Group("/admin")
		admin.Use(middleware.RequireAuth(), middleware.RequireAdmin())
		{
			admin.PUT("/payment-info", h.AdminUpdatePaymentInfo)
			admin.PUT("/packages", h.AdminUpdatePackages)
			admin.POST("/packages/reset", h.AdminResetPackages)
		}
	}
}

func (h *Handler) GetPackages(c *gin.Context) {
	pkgs := h.GetDynamicPackages()
	userID := middleware.GetCurrentUserID(c)

	if userID > 0 {
		var u domain.User
		if err := h.db.First(&u, userID).Error; err == nil {
			isVip := (u.Role == domain.RoleVIP || u.Membership == domain.MembershipVIP) &&
				(u.VipExpiresAt == nil || u.VipExpiresAt.After(time.Now().UTC()))
			if isVip {
				var latestPaid domain.MembershipOrder
				h.db.Where("user_id = ? AND status = 'PAID'", userID).Order("paid_at DESC, created_at DESC").First(&latestPaid)
				currentDays := latestPaid.DurationDays
				if currentDays == 0 {
					currentDays = 30
				}

				for i := range pkgs {
					if pkgs[i].DurationDays <= currentDays {
						pkgs[i].IsLocked = true
						if pkgs[i].DurationDays == currentDays || pkgs[i].ID == latestPaid.PackageID {
							pkgs[i].IsCurrent = true
						}
					} else {
						pkgs[i].IsLocked = false
						pkgs[i].CanUpgrade = true
					}
				}
			}
		}
	}

	response.OK(c, pkgs, nil)
}

func (h *Handler) GetPaymentInfo(c *gin.Context) {
	info := h.GetPaymentSettings()
	response.OK(c, info, nil)
}

func (h *Handler) AdminUpdatePaymentInfo(c *gin.Context) {
	var req struct {
		BankName      string `json:"bankName" binding:"required"`
		AccountNumber string `json:"accountNumber" binding:"required"`
		AccountName   string `json:"accountName" binding:"required"`
		NotePrefix    string `json:"notePrefix"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Vui lòng nhập đầy đủ thông tin: "+err.Error())
		return
	}

	now := time.Now().UTC()
	items := map[string]string{
		"bank_name":      req.BankName,
		"account_number": req.AccountNumber,
		"account_name":   req.AccountName,
		"note_prefix":    req.NotePrefix,
	}
	for k, v := range items {
		var s domain.SystemSetting
		if err := h.db.Session(&gorm.Session{}).Where("`key` = ?", k).Take(&s).Error; err == nil {
			h.db.Model(&domain.SystemSetting{}).Where("`key` = ?", k).Updates(map[string]interface{}{"value": v, "updated_at": now})
		} else {
			h.db.Create(&domain.SystemSetting{Key: k, Value: v, UpdatedAt: now})
		}
	}

	response.OK(c, h.GetPaymentSettings(), nil)
}

func (h *Handler) AdminUpdatePackages(c *gin.Context) {
	var req struct {
		Packages []VIPPackage `json:"packages" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu gói không hợp lệ: "+err.Error())
		return
	}

	// Sanitize runtime user-specific flags before saving into system_settings
	cleaned := make([]VIPPackage, len(req.Packages))
	for i, p := range req.Packages {
		if p.Amount <= 0 && p.PriceVND > 0 {
			p.Amount = p.PriceVND
		}
		if p.PriceVND <= 0 && p.Amount > 0 {
			p.PriceVND = p.Amount
		}
		p.IsLocked = false
		p.IsCurrent = false
		p.CanUpgrade = false
		cleaned[i] = p
	}

	now := time.Now().UTC()
	bytes, err := json.Marshal(cleaned)
	if err != nil {
		response.BadRequest(c, "Không thể mã hóa dữ liệu: "+err.Error())
		return
	}

	var s domain.SystemSetting
	if err := h.db.Session(&gorm.Session{}).Where("`key` = ?", "vip_packages").Take(&s).Error; err == nil {
		h.db.Model(&domain.SystemSetting{}).Where("`key` = ?", "vip_packages").Updates(map[string]interface{}{"value": string(bytes), "updated_at": now})
	} else {
		h.db.Create(&domain.SystemSetting{Key: "vip_packages", Value: string(bytes), UpdatedAt: now})
	}

	response.OK(c, cleaned, nil)
}

func (h *Handler) AdminResetPackages(c *gin.Context) {
	h.db.Where("`key` = ?", "vip_packages").Delete(&domain.SystemSetting{})
	response.OK(c, AvailablePackages, nil)
}

func (h *Handler) GetMyMembership(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)

	var u domain.User
	if err := h.db.First(&u, userID).Error; err != nil {
		response.NotFound(c, "Người dùng không tồn tại")
		return
	}

	now := time.Now().UTC()
	isVip := u.Role == domain.RoleAdmin || u.Role == domain.RoleVIP || u.Membership == domain.MembershipVIP
	if u.VipExpiresAt != nil && now.After(*u.VipExpiresAt) && u.Role != domain.RoleAdmin {
		isVip = false
		// Tự động chuyển về FREE nếu hết hạn
		h.db.Model(&u).Updates(map[string]interface{}{
			"membership": domain.MembershipFree,
			"role":       domain.RoleUser,
		})
		u.Membership = domain.MembershipFree
		u.Role = domain.RoleUser
	}

	daysRemaining := 0
	if u.VipExpiresAt != nil && u.VipExpiresAt.After(now) {
		daysRemaining = int(math.Ceil(u.VipExpiresAt.Sub(now).Hours() / 24.0))
	}

	// Lấy đơn hàng gần nhất
	var latestOrder domain.MembershipOrder
	var latestOrderPtr *domain.MembershipOrder
	if err := h.db.Where("user_id = ?", userID).Order("created_at DESC").First(&latestOrder).Error; err == nil {
		latestOrderPtr = &latestOrder
	}

	response.OK(c, gin.H{
		"userId":        u.ID,
		"username":      u.Username,
		"role":          u.Role,
		"membership":    u.Membership,
		"isVip":         isVip,
		"vipExpiresAt":  u.VipExpiresAt,
		"daysRemaining": daysRemaining,
		"latestOrder":   latestOrderPtr,
	}, nil)
}

func generateNumericOrderCode() int64 {
	// 11-12 digit safe positive integer: unix seconds (10 digits) * 100 + 2 random digits
	n, _ := rand.Int(rand.Reader, big.NewInt(90))
	suffix := n.Int64() + 10
	return time.Now().UTC().Unix()*100 + suffix
}

func (h *Handler) buildOrderResponse(order domain.MembershipOrder, payInfo PaymentInfo) gin.H {
	bankName := payInfo.BankName
	if order.BankBIN != "" {
		bankName = external.ResolveBankNameByBIN(order.BankBIN, payInfo.BankName)
	}
	accountNumber := order.AccountNumber
	if accountNumber == "" {
		accountNumber = payInfo.AccountNumber
	}
	accountName := order.AccountName
	if accountName == "" {
		accountName = payInfo.AccountName
	}
	transferContent := order.TransferContent
	if transferContent == "" {
		transferContent = order.OrderCode
	}

	return gin.H{
		"id":              order.ID,
		"orderCode":       order.OrderCode,
		"payosOrderCode":  order.PayOSOrderCode,
		"paymentLinkId":   order.PaymentLinkID,
		"checkoutUrl":     order.CheckoutURL,
		"qrCode":          order.QRCodeData,
		"qrCodeUrl":       order.QRCodeURL,
		"provider":        order.Provider,
		"userId":          order.UserID,
		"packageId":       order.PackageID,
		"packageName":     order.PackageName,
		"amount":          order.Amount,
		"priceVND":        order.Amount,
		"durationDays":    order.DurationDays,
		"status":          order.Status,
		"bankBin":         order.BankBIN,
		"bankName":        bankName,
		"accountNumber":   accountNumber,
		"accountName":     accountName,
		"transferContent": transferContent,
		"expiresAt":       order.ExpiresAt,
		"paidAt":          order.PaidAt,
		"createdAt":       order.CreatedAt,
	}
}

func (h *Handler) CreateOrder(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)

	var req CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Vui lòng chọn gói VIP hợp lệ")
		return
	}

	pkgs := h.GetDynamicPackages()
	var pkg *VIPPackage
	for _, p := range pkgs {
		if p.ID == req.PackageID ||
			(p.ID == "VIP_1M" && req.PackageID == "1_MONTH") ||
			(p.ID == "VIP_3M" && req.PackageID == "3_MONTHS") ||
			(p.ID == "VIP_1Y" && req.PackageID == "12_MONTHS") {
			copyP := p
			pkg = &copyP
			break
		}
	}
	if pkg == nil {
		response.BadRequest(c, "Gói VIP không tồn tại")
		return
	}

	amount := pkg.Amount
	if amount <= 0 {
		amount = pkg.PriceVND
	}
	if amount < 2000 {
		response.BadRequest(c, "Số tiền thanh toán tối thiểu là 2.000đ")
		return
	}

	var u domain.User
	if err := h.db.First(&u, userID).Error; err == nil {
		isVip := (u.Role == domain.RoleVIP || u.Membership == domain.MembershipVIP) && u.VipExpiresAt != nil && u.VipExpiresAt.After(time.Now().UTC())
		if isVip {
			var latestPaid domain.MembershipOrder
			h.db.Where("user_id = ? AND status = 'PAID'", userID).Order("paid_at DESC, created_at DESC").First(&latestPaid)
			currentDays := latestPaid.DurationDays
			if currentDays == 0 {
				currentDays = 30
			}
			if pkg.DurationDays <= currentDays {
				response.BadRequest(c, "Bạn đã đăng ký gói này và gói hiện đang bị khóa. Vui lòng chọn nâng cấp lên các gói cao hơn để cộng dồn thời hạn VIP!")
				return
			}
		}
	}

	payInfo := h.GetPaymentSettings()
	numericCode := generateNumericOrderCode()
	orderCode := strconv.FormatInt(numericCode, 10)
	expiresAt := time.Now().UTC().Add(15 * time.Minute)

	shortPkg := strings.ReplaceAll(pkg.ID, "_", "")
	description := external.SanitizePayOSDescription(fmt.Sprintf("WL %s U%d", shortPkg, userID))

	order := domain.MembershipOrder{
		OrderCode:       orderCode,
		PayOSOrderCode:  numericCode,
		UserID:          userID,
		PackageID:       pkg.ID,
		PackageName:     pkg.Name,
		Amount:          amount,
		DurationDays:    pkg.DurationDays,
		Status:          "PENDING",
		Provider:        "PAYOS",
		TransferContent: description,
		ExpiresAt:       expiresAt,
		CreatedAt:       time.Now().UTC(),
	}

	if h.payos != nil && h.payos.IsConfigured() {
		returnURL := h.cfg.PayOSReturnURL
		cancelURL := h.cfg.PayOSCancelURL
		if origin := strings.TrimRight(c.GetHeader("Origin"), "/"); origin != "" &&
			(strings.Contains(returnURL, "localhost") || returnURL == "") {
			returnURL = origin + "/membership?payment=success&orderCode=" + orderCode
			cancelURL = origin + "/membership?payment=cancelled&orderCode=" + orderCode
		} else {
			sep := "?"
			if strings.Contains(returnURL, "?") {
				sep = "&"
			}
			returnURL = returnURL + sep + "orderCode=" + orderCode
			cSep := "?"
			if strings.Contains(cancelURL, "?") {
				cSep = "&"
			}
			cancelURL = cancelURL + cSep + "orderCode=" + orderCode
		}

		payData, err := h.payos.CreatePaymentLink(external.PayOSCreatePaymentRequest{
			OrderCode:   numericCode,
			Amount:      amount,
			Description: description,
			BuyerName:   u.Username,
			BuyerEmail:  u.Email,
			Items: []external.PayOSItem{
				{
					Name:     pkg.Name,
					Quantity: 1,
					Price:    amount,
				},
			},
			ReturnURL: returnURL,
			CancelURL: cancelURL,
			ExpiredAt: expiresAt.Unix(),
		})
		if err != nil {
			slog.Error("payOS CreatePaymentLink failed", "error", err, "orderCode", orderCode, "userId", userID)
			response.Error(c, http.StatusBadGateway, "PAYOS_ERROR", "Không thể khởi tạo cổng thanh toán payOS: "+err.Error())
			return
		}

		order.PaymentLinkID = payData.PaymentLinkID
		order.CheckoutURL = payData.CheckoutURL
		order.QRCodeData = payData.QRCode
		order.BankBIN = payData.BIN
		order.AccountNumber = payData.AccountNumber
		order.AccountName = payData.AccountName
		if payData.Description != "" {
			order.TransferContent = payData.Description
		}
		if payData.BIN != "" && payData.AccountNumber != "" {
			order.QRCodeURL = fmt.Sprintf(
				"https://img.vietqr.io/image/%s-%s-compact2.png?amount=%d&addInfo=%s&accountName=%s",
				payData.BIN,
				payData.AccountNumber,
				payData.Amount,
				url.QueryEscape(order.TransferContent),
				url.QueryEscape(payData.AccountName),
			)
		}
	} else {
		if h.cfg != nil && h.cfg.IsProduction() {
			response.Error(c, http.StatusServiceUnavailable, "PAYOS_NOT_CONFIGURED", "Cổng thanh toán payOS chưa được cấu hình. Vui lòng liên hệ quản trị viên.")
			return
		}
		// Non-production fallback for offline/unit test environments without PayOS credentials
		order.Provider = "VIETQR_DEV"
		order.BankBIN = "970422"
		order.AccountNumber = payInfo.AccountNumber
		order.AccountName = payInfo.AccountName
		order.TransferContent = description
		order.QRCodeURL = fmt.Sprintf(
			"https://img.vietqr.io/image/970422-%s-compact2.png?amount=%d&addInfo=%s&accountName=%s",
			payInfo.AccountNumber,
			amount,
			url.QueryEscape(description),
			url.QueryEscape(payInfo.AccountName),
		)
	}

	if err := h.db.Create(&order).Error; err != nil {
		response.Internal(c, "Không thể tạo đơn hàng thanh toán: "+err.Error())
		return
	}

	response.Created(c, h.buildOrderResponse(order, payInfo))
}

// completeOrderAndUpgradeVIP atomically marks a PENDING order PAID and upgrades the user's VIP expiry.
// Safe against duplicate concurrent webhook + polling calls.
func (h *Handler) completeOrderAndUpgradeVIP(order *domain.MembershipOrder) (*domain.User, bool, error) {
	now := time.Now().UTC()
	upgraded := false
	var updatedUser domain.User

	err := h.db.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&domain.MembershipOrder{}).
			Where("id = ? AND status = ?", order.ID, "PENDING").
			Updates(map[string]interface{}{
				"status":  "PAID",
				"paid_at": &now,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			// Already processed by another webhook/polling request
			return nil
		}

		upgraded = true

		var u domain.User
		if err := tx.First(&u, order.UserID).Error; err != nil {
			return err
		}

		var newExpiry time.Time
		if u.VipExpiresAt != nil && u.VipExpiresAt.After(now) {
			newExpiry = u.VipExpiresAt.Add(time.Duration(order.DurationDays) * 24 * time.Hour)
		} else {
			newExpiry = now.Add(time.Duration(order.DurationDays) * 24 * time.Hour)
		}

		newRole := domain.RoleVIP
		if u.Role == domain.RoleAdmin {
			newRole = domain.RoleAdmin
		}

		if err := tx.Model(&u).Updates(map[string]interface{}{
			"role":           newRole,
			"membership":     domain.MembershipVIP,
			"vip_expires_at": &newExpiry,
		}).Error; err != nil {
			return err
		}

		notif := domain.Notification{
			UserID:    order.UserID,
			Title:     "Chúc mừng bạn đã nâng cấp VIP thành công!",
			Message:   fmt.Sprintf("Đơn hàng #%s (%s) đã được xác nhận qua payOS. Thời hạn VIP tới %s.", order.OrderCode, order.PackageName, newExpiry.Format("02/01/2006")),
			Type:      "VIP",
			Link:      "/profile",
			IsRead:    false,
			CreatedAt: now,
		}
		if err := tx.Create(&notif).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, false, err
	}

	_ = h.db.First(order, order.ID)
	if err := h.db.First(&updatedUser, order.UserID).Error; err == nil {
		return &updatedUser, upgraded, nil
	}
	return nil, upgraded, nil
}

func (h *Handler) GetOrder(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	orderCode := strings.TrimSpace(c.Param("orderCode"))

	var order domain.MembershipOrder
	query := h.db.Where("user_id = ? AND order_code = ?", userID, orderCode)
	if numCode, err := strconv.ParseInt(orderCode, 10, 64); err == nil {
		query = h.db.Where("user_id = ? AND (order_code = ? OR payos_order_code = ?)", userID, orderCode, numCode)
	}
	if err := query.First(&order).Error; err != nil {
		response.NotFound(c, "Không tìm thấy đơn hàng")
		return
	}

	var updatedUser *domain.User
	var refreshedToken string

	// Live sync with PayOS API while PENDING (handles instant confirmation even without public webhook URL)
	if order.Status == "PENDING" && order.Provider == "PAYOS" && h.payos != nil && h.payos.IsConfigured() && order.PayOSOrderCode > 0 {
		if info, err := h.payos.GetPaymentLinkInfo(order.PayOSOrderCode); err == nil && info != nil {
			switch strings.ToUpper(info.Status) {
			case "PAID":
				if u, _, upErr := h.completeOrderAndUpgradeVIP(&order); upErr == nil && u != nil {
					updatedUser = u
					if h.cfg != nil && h.cfg.JWTSecret != "" {
						if tok, tokErr := middleware.GenerateToken(*u, h.cfg.JWTSecret); tokErr == nil {
							refreshedToken = tok
						}
					}
				}
			case "CANCELLED":
				h.db.Model(&order).Update("status", "CANCELLED")
				order.Status = "CANCELLED"
			case "EXPIRED":
				h.db.Model(&order).Update("status", "EXPIRED")
				order.Status = "EXPIRED"
			}
		}
	}

	// Kiểm tra nếu quá 15 phút chưa thanh toán thì đánh dấu EXPIRED
	if order.Status == "PENDING" && time.Now().UTC().After(order.ExpiresAt) {
		h.db.Model(&order).Update("status", "EXPIRED")
		order.Status = "EXPIRED"
	}

	payInfo := h.GetPaymentSettings()
	orderData := h.buildOrderResponse(order, payInfo)
	if updatedUser != nil {
		orderData["user"] = gin.H{
			"id":           updatedUser.ID,
			"username":     updatedUser.Username,
			"role":         updatedUser.Role,
			"membership":   updatedUser.Membership,
			"vipExpiresAt": updatedUser.VipExpiresAt,
		}
		if refreshedToken != "" {
			orderData["token"] = refreshedToken
		}
	}

	response.OK(c, orderData, nil)
}

func (h *Handler) CancelOrder(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	orderCode := strings.TrimSpace(c.Param("orderCode"))

	var order domain.MembershipOrder
	if err := h.db.Where("user_id = ? AND order_code = ?", userID, orderCode).First(&order).Error; err != nil {
		response.NotFound(c, "Không tìm thấy đơn hàng")
		return
	}

	if order.Status == "PAID" {
		response.BadRequest(c, "Đơn hàng đã thanh toán thành công, không thể hủy")
		return
	}

	if order.Provider == "PAYOS" && h.payos != nil && h.payos.IsConfigured() && order.PayOSOrderCode > 0 {
		_ = h.payos.CancelPaymentLink(order.PayOSOrderCode, "Người dùng hủy đơn hàng")
	}

	h.db.Model(&order).Update("status", "CANCELLED")
	order.Status = "CANCELLED"

	response.OK(c, gin.H{
		"message":   "Đã hủy đơn hàng thanh toán",
		"orderCode": order.OrderCode,
		"status":    order.Status,
	}, nil)
}

// PayOSWebhook handles real-time payment confirmation webhooks from PayOS v2.
func (h *Handler) PayOSWebhook(c *gin.Context) {
	rawBody, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		response.BadRequest(c, "Không thể đọc dữ liệu webhook")
		return
	}

	var payload struct {
		Code      string                 `json:"code"`
		Desc      string                 `json:"desc"`
		Success   bool                   `json:"success"`
		Data      map[string]interface{} `json:"data"`
		Signature string                 `json:"signature"`
	}

	dec := json.NewDecoder(bytes.NewReader(rawBody))
	dec.UseNumber()
	if err := dec.Decode(&payload); err != nil {
		response.BadRequest(c, "Payload webhook payOS không hợp lệ")
		return
	}

	// PayOS dashboard sends a verification test ping (empty or orderCode=123) when registering webhook URL
	if len(payload.Data) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "webhook verified"})
		return
	}

	var payosOrderCode int64
	if rawOC, ok := payload.Data["orderCode"]; ok {
		switch v := rawOC.(type) {
		case json.Number:
			payosOrderCode, _ = v.Int64()
		case float64:
			payosOrderCode = int64(v)
		case string:
			payosOrderCode, _ = strconv.ParseInt(v, 10, 64)
		}
	}

	if payosOrderCode == 123 {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "payOS test webhook acknowledged"})
		return
	}

	if h.payos == nil || !h.payos.IsConfigured() {
		response.Error(c, http.StatusServiceUnavailable, "PAYOS_NOT_CONFIGURED", "payOS chưa được cấu hình")
		return
	}

	if !h.payos.VerifyWebhookSignature(payload.Data, payload.Signature) {
		slog.Warn("payOS webhook signature verification failed", "orderCode", payosOrderCode)
		response.BadRequest(c, "Chữ ký webhook payOS không hợp lệ")
		return
	}

	if payload.Code != "00" || !payload.Success {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "ignored non-success webhook"})
		return
	}

	var order domain.MembershipOrder
	if err := h.db.Where("payos_order_code = ? OR order_code = ?", payosOrderCode, strconv.FormatInt(payosOrderCode, 10)).First(&order).Error; err != nil {
		slog.Warn("payOS webhook order not found", "payosOrderCode", payosOrderCode)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "order not found"})
		return
	}

	// Verify paid amount matches order amount
	var paidAmount int64
	if rawAmt, ok := payload.Data["amount"]; ok {
		switch v := rawAmt.(type) {
		case json.Number:
			paidAmount, _ = v.Int64()
		case float64:
			paidAmount = int64(v)
		}
	}
	if paidAmount > 0 && int(paidAmount) < order.Amount {
		slog.Warn("payOS webhook underpayment detected", "orderCode", order.OrderCode, "expected", order.Amount, "paid", paidAmount)
		response.BadRequest(c, "Số tiền thanh toán không đủ")
		return
	}

	if _, _, err := h.completeOrderAndUpgradeVIP(&order); err != nil {
		slog.Error("payOS webhook failed to upgrade VIP", "orderCode", order.OrderCode, "error", err)
		response.Internal(c, "Lỗi cập nhật VIP từ webhook")
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "orderCode": order.OrderCode})
}

func (h *Handler) SimulatePayment(c *gin.Context) {
	// Strictly block simulated free VIP upgrades in production or for non-admin accounts
	if h.cfg != nil && h.cfg.IsProduction() {
		response.Forbidden(c, "Tính năng mô phỏng thanh toán đã bị vô hiệu hóa trên môi trường Production. Vui lòng thanh toán qua mã QR payOS.")
		return
	}
	if middleware.GetCurrentUserRole(c) != domain.RoleAdmin {
		response.Forbidden(c, "Chỉ quản trị viên trong môi trường phát triển mới được phép mô phỏng thanh toán")
		return
	}

	orderCode := c.Param("orderCode")

	var req SimulatePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Trạng thái mô phỏng không hợp lệ")
		return
	}

	var order domain.MembershipOrder
	if err := h.db.Where("order_code = ?", orderCode).First(&order).Error; err != nil {
		response.NotFound(c, "Không tìm thấy đơn hàng")
		return
	}

	if order.Status == "PAID" {
		response.OK(c, gin.H{
			"message": "Đơn hàng này đã được thanh toán trước đó",
			"order":   order,
		}, nil)
		return
	}
	if order.Status != "PENDING" {
		response.BadRequest(c, "Chỉ có thể xử lý đơn hàng đang ở trạng thái chờ thanh toán (PENDING)")
		return
	}

	if req.Status == "FAILED" {
		h.db.Model(&order).Update("status", "FAILED")
		order.Status = "FAILED"
		response.OK(c, gin.H{
			"success": false,
			"message": "Giao dịch mô phỏng thất bại hoặc đã bị người dùng hủy",
			"order":   order,
		}, nil)
		return
	}

	if req.Status != "SUCCESS" {
		response.BadRequest(c, "Trạng thái mô phỏng chỉ nhận SUCCESS hoặc FAILED")
		return
	}

	updatedUser, _, err := h.completeOrderAndUpgradeVIP(&order)
	if err != nil {
		response.Internal(c, "Lỗi cập nhật quyền VIP: "+err.Error())
		return
	}

	respData := gin.H{
		"success": true,
		"message": "Nâng cấp VIP thành công! Toàn bộ quyền lợi đã được kích hoạt.",
		"order":   order,
	}
	if updatedUser != nil {
		respData["user"] = gin.H{
			"id":           updatedUser.ID,
			"username":     updatedUser.Username,
			"role":         updatedUser.Role,
			"membership":   updatedUser.Membership,
			"vipExpiresAt": updatedUser.VipExpiresAt,
		}
		if h.cfg != nil && h.cfg.JWTSecret != "" {
			if tok, tokErr := middleware.GenerateToken(*updatedUser, h.cfg.JWTSecret); tokErr == nil {
				respData["token"] = tok
			}
		}
	}

	response.OK(c, respData, nil)
}

func (h *Handler) CancelVIP(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	var req CancelVipRequest
	_ = c.ShouldBindJSON(&req)

	var u domain.User
	if err := h.db.First(&u, userID).Error; err != nil {
		response.NotFound(c, "Người dùng không tồn tại")
		return
	}

	// Never demote an ADMIN account when canceling VIP subscription
	nextRole := domain.RoleUser
	if u.Role == domain.RoleAdmin {
		nextRole = domain.RoleAdmin
	}

	now := time.Now().UTC()
	u.Role = nextRole
	u.Membership = domain.MembershipFree
	u.VipExpiresAt = nil

	if err := h.db.Model(&u).Updates(map[string]interface{}{
		"role":           nextRole,
		"membership":     domain.MembershipFree,
		"vip_expires_at": nil,
	}).Error; err != nil {
		response.Internal(c, "Lỗi hủy gói VIP")
		return
	}

	notif := domain.Notification{
		UserID:    userID,
		Title:     "Hủy gói VIP WaveLink thành công",
		Message:   "Bạn đã hủy gia hạn gói VIP. Quyền lợi VIP đã dừng. Cảm ơn bạn đã đồng hành cùng WaveLink!",
		Type:      "SYSTEM",
		Link:      "/membership",
		IsRead:    false,
		CreatedAt: now,
	}
	notification.CreateSafeNotification(h.db, notif)

	response.OK(c, gin.H{"message": "Đã hủy gói VIP thành công", "user": u}, nil)
}

func (h *Handler) notifyAdmins(title, message, link string) {
	var admins []domain.User
	if err := h.db.Where("role = ?", domain.RoleAdmin).Find(&admins).Error; err != nil {
		return
	}
	now := time.Now().UTC()
	for _, adm := range admins {
		notification.CreateSafeNotification(h.db, domain.Notification{
			UserID:    adm.ID,
			Title:     title,
			Message:   message,
			Type:      "SYSTEM",
			Link:      link,
			IsRead:    false,
			CreatedAt: now,
		})
	}
}

func (h *Handler) RequestRefund(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	var req RefundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Vui lòng nhập lý do yêu cầu hoàn tiền")
		return
	}

	var u domain.User
	_ = h.db.First(&u, userID)

	now := time.Now().UTC()
	notif := domain.Notification{
		UserID:    userID,
		Title:     "Yêu cầu hoàn tiền đã được tiếp nhận",
		Message:   fmt.Sprintf("Yêu cầu hoàn tiền cho đơn hàng '%s' (Lý do: %s) đã được gửi tới Ban quản trị.", req.OrderCode, req.Reason),
		Type:      "SYSTEM",
		Link:      "/settings",
		IsRead:    false,
		CreatedAt: now,
	}
	notification.CreateSafeNotification(h.db, notif)

	// Forward refund request details to all Admins so it is never silently dropped
	h.notifyAdmins(
		fmt.Sprintf("[Hoàn tiền] Yêu cầu từ %s (Đơn: %s)", u.Username, req.OrderCode),
		fmt.Sprintf("Người dùng #%d (%s) yêu cầu hoàn tiền đơn '%s'. Lý do: %s. Thông tin nhận hoàn: %s", userID, u.Username, req.OrderCode, req.Reason, req.BankInfo),
		"/admin/vip",
	)

	response.OK(c, gin.H{
		"message":   "Yêu cầu hoàn tiền đã được gửi tới Ban quản trị! Chúng tôi sẽ kiểm tra và liên hệ lại sớm nhất.",
		"orderCode": req.OrderCode,
	}, nil)
}

func (h *Handler) SubmitComplaint(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	var req ComplaintRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Vui lòng nhập tiêu đề và nội dung khiếu nại")
		return
	}

	category := req.Category
	if category == "" {
		category = "Chung"
	}

	var u domain.User
	_ = h.db.First(&u, userID)

	now := time.Now().UTC()
	notif := domain.Notification{
		UserID:    userID,
		Title:     fmt.Sprintf("Đã tiếp nhận góp ý/khiếu nại [%s]", category),
		Message:   fmt.Sprintf("Nội dung: '%s'. Ban quản trị WaveLink đã nhận được phản hồi của bạn và sẽ kiểm tra sớm nhất.", req.Subject),
		Type:      "SYSTEM",
		Link:      "/notifications",
		IsRead:    false,
		CreatedAt: now,
	}
	notification.CreateSafeNotification(h.db, notif)

	// Forward complaint to all Admins so it actually reaches moderation
	h.notifyAdmins(
		fmt.Sprintf("[Khiếu nại - %s] %s", category, req.Subject),
		fmt.Sprintf("Từ %s (#%d): %s", u.Username, userID, req.Content),
		"/admin/community",
	)

	response.OK(c, gin.H{
		"message":  "Khiếu nại/Góp ý của bạn đã được gửi tới Ban quản trị! Cảm ơn bạn đã đóng góp cho WaveLink.",
		"category": category,
		"subject":  req.Subject,
	}, nil)
}
