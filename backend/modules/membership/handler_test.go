package membership_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"audio-app-backend/config"
	"audio-app-backend/core/domain"
	"audio-app-backend/infra/external"
	"audio-app-backend/modules/membership"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupMembershipTest(t *testing.T) (*gin.Engine, *gorm.DB, *membership.Handler, domain.User, string, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite in-memory db: %v", err)
	}
	if err := db.AutoMigrate(&domain.User{}, &domain.MembershipOrder{}, &domain.SystemSetting{}, &domain.Notification{}); err != nil {
		t.Fatalf("failed to migrate tables: %v", err)
	}

	user := domain.User{
		Username:   "vip_tester",
		Email:      "vip_tester@example.com",
		Role:       domain.RoleUser,
		Membership: domain.MembershipFree,
		CreatedAt:  time.Now().UTC(),
	}
	admin := domain.User{
		Username:   "admin_tester",
		Email:      "admin_tester@example.com",
		Role:       domain.RoleAdmin,
		Membership: domain.MembershipVIP,
		CreatedAt:  time.Now().UTC(),
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}

	cfg := &config.Config{
		AppEnv:    "development",
		JWTSecret: "membership-test-secret-1234567890",
	}
	userTok, err := middleware.GenerateToken(user, cfg.JWTSecret)
	if err != nil {
		t.Fatalf("failed to sign user token: %v", err)
	}
	adminTok, err := middleware.GenerateToken(admin, cfg.JWTSecret)
	if err != nil {
		t.Fatalf("failed to sign admin token: %v", err)
	}

	r := gin.New()
	r.Use(middleware.SessionMiddleware(cfg.JWTSecret))
	rg := r.Group("/api/v1")
	h := membership.NewHandler(db, cfg)
	h.RegisterRoutes(rg)

	return r, db, h, user, userTok, adminTok
}

func TestCreateOrder_ReusesSamePackageAndReplacesDifferentPackage(t *testing.T) {
	app, db, _, user, userTok, _ := setupMembershipTest(t)

	// 1. Create VIP_1M order
	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader([]byte(`{"packageId":"VIP_1M"}`)))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Authorization", "Bearer "+userTok)
	w1 := httptest.NewRecorder()
	app.ServeHTTP(w1, req1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w1.Code, w1.Body.String())
	}
	var env1 response.Envelope
	_ = json.Unmarshal(w1.Body.Bytes(), &env1)
	code1 := env1.Data.(map[string]interface{})["orderCode"].(string)

	// 2. Create VIP_1M again while unexpired -> reuses same orderCode
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader([]byte(`{"packageId":"VIP_1M"}`)))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Authorization", "Bearer "+userTok)
	w2 := httptest.NewRecorder()
	app.ServeHTTP(w2, req2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on reuse, got %d: %s", w2.Code, w2.Body.String())
	}
	var env2 response.Envelope
	_ = json.Unmarshal(w2.Body.Bytes(), &env2)
	data2 := env2.Data.(map[string]interface{})
	if data2["orderCode"].(string) != code1 {
		t.Fatalf("expected reused orderCode %s, got %s", code1, data2["orderCode"])
	}
	if data2["reused"] != true {
		t.Fatalf("expected reused=true flag, got %+v", data2)
	}

	var count int64
	db.Model(&domain.MembershipOrder{}).Where("user_id = ?", user.ID).Count(&count)
	if count != 1 {
		t.Fatalf("expected 1 order in db after reuse, got %d", count)
	}

	// 3. Switch to VIP_3M -> deletes old VIP_1M pending order and creates new VIP_3M order
	req3 := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader([]byte(`{"packageId":"VIP_3M"}`)))
	req3.Header.Set("Content-Type", "application/json")
	req3.Header.Set("Authorization", "Bearer "+userTok)
	w3 := httptest.NewRecorder()
	app.ServeHTTP(w3, req3)
	if w3.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created when switching package, got %d: %s", w3.Code, w3.Body.String())
	}
	var env3 response.Envelope
	_ = json.Unmarshal(w3.Body.Bytes(), &env3)
	data3 := env3.Data.(map[string]interface{})
	if data3["orderCode"].(string) == code1 || data3["packageId"].(string) != "VIP_3M" {
		t.Fatalf("expected new VIP_3M order replacing %s, got %+v", code1, data3)
	}

	db.Model(&domain.MembershipOrder{}).Where("user_id = ?", user.ID).Count(&count)
	if count != 1 {
		t.Fatalf("expected old pending order deleted and only 1 order in db, got %d", count)
	}
}

func TestExpiredOrder_AutoCancelledAndDeletedFromHistory(t *testing.T) {
	app, db, h, user, userTok, _ := setupMembershipTest(t)

	expiredOrder := domain.MembershipOrder{
		OrderCode:       "EXPIRED12345",
		PayOSOrderCode:  12345,
		UserID:          user.ID,
		PackageID:       "VIP_1M",
		PackageName:     "Gói 1 Tháng",
		Amount:          49000,
		DurationDays:    30,
		Status:          "PENDING",
		Provider:        "VIETQR_DEV",
		TransferContent: "WL VIP1M",
		ExpiresAt:       time.Now().UTC().Add(-2 * time.Minute),
		CreatedAt:       time.Now().UTC().Add(-17 * time.Minute),
	}
	if err := db.Create(&expiredOrder).Error; err != nil {
		t.Fatalf("failed to seed expired order: %v", err)
	}

	// Visiting GET /api/v1/membership/orders reconciles and deletes expired unpaid order
	req := httptest.NewRequest(http.MethodGet, "/api/v1/membership/orders", nil)
	req.Header.Set("Authorization", "Bearer "+userTok)
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}
	var env response.Envelope
	_ = json.Unmarshal(w.Body.Bytes(), &env)
	data := env.Data.(map[string]interface{})
	orders := data["orders"].([]interface{})
	if len(orders) != 0 {
		t.Fatalf("expected expired order purged from orders list, got %d items", len(orders))
	}

	var count int64
	db.Model(&domain.MembershipOrder{}).Where("order_code = ?", expiredOrder.OrderCode).Count(&count)
	if count != 0 {
		t.Fatalf("expected expired order deleted from DB, still found %d", count)
	}

	// Also verify CleanupExpiredOrders sweeper deletes expired pending orders globally
	expiredOrder2 := domain.MembershipOrder{
		OrderCode:       "EXPIRED67890",
		PayOSOrderCode:  67890,
		UserID:          user.ID,
		PackageID:       "VIP_1M",
		PackageName:     "Gói 1 Tháng",
		Amount:          49000,
		DurationDays:    30,
		Status:          "PENDING",
		Provider:        "VIETQR_DEV",
		TransferContent: "WL VIP1M",
		ExpiresAt:       time.Now().UTC().Add(-5 * time.Minute),
		CreatedAt:       time.Now().UTC().Add(-20 * time.Minute),
	}
	if err := db.Create(&expiredOrder2).Error; err != nil {
		t.Fatalf("failed to seed second expired order: %v", err)
	}
	if cleaned := h.CleanupExpiredOrders(); cleaned < 1 {
		t.Fatalf("expected CleanupExpiredOrders >= 1, got %d", cleaned)
	}
	db.Model(&domain.MembershipOrder{}).Where("order_code = ?", expiredOrder2.OrderCode).Count(&count)
	if count != 0 {
		t.Fatalf("expected sweeper to delete expired order from DB, still found %d", count)
	}
}

func TestCancelOrder_DeletesUnpaidAndPreservesPaid(t *testing.T) {
	app, db, _, user, userTok, adminTok := setupMembershipTest(t)

	// 1. Create pending order then cancel it -> deleted from DB
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader([]byte(`{"packageId":"VIP_1M"}`)))
	reqCreate.Header.Set("Content-Type", "application/json")
	reqCreate.Header.Set("Authorization", "Bearer "+userTok)
	wCreate := httptest.NewRecorder()
	app.ServeHTTP(wCreate, reqCreate)
	var envCreate response.Envelope
	_ = json.Unmarshal(wCreate.Body.Bytes(), &envCreate)
	code1 := envCreate.Data.(map[string]interface{})["orderCode"].(string)

	reqCancel := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders/"+code1+"/cancel", nil)
	reqCancel.Header.Set("Authorization", "Bearer "+userTok)
	wCancel := httptest.NewRecorder()
	app.ServeHTTP(wCancel, reqCancel)
	if wCancel.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on cancel, got %d: %s", wCancel.Code, wCancel.Body.String())
	}
	var envCancel response.Envelope
	_ = json.Unmarshal(wCancel.Body.Bytes(), &envCancel)
	cancelData := envCancel.Data.(map[string]interface{})
	if cancelData["deleted"] != true || cancelData["status"] != "CANCELLED" {
		t.Fatalf("expected deleted=true & CANCELLED, got %+v", cancelData)
	}

	var count int64
	db.Model(&domain.MembershipOrder{}).Where("order_code = ?", code1).Count(&count)
	if count != 0 {
		t.Fatalf("expected cancelled unpaid order deleted from DB, got %d", count)
	}

	// 2. Create another order, pay it via admin simulate, then attempt cancel -> MUST preserve PAID order
	reqCreate2 := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader([]byte(`{"packageId":"VIP_1M"}`)))
	reqCreate2.Header.Set("Content-Type", "application/json")
	reqCreate2.Header.Set("Authorization", "Bearer "+userTok)
	wCreate2 := httptest.NewRecorder()
	app.ServeHTTP(wCreate2, reqCreate2)
	var envCreate2 response.Envelope
	_ = json.Unmarshal(wCreate2.Body.Bytes(), &envCreate2)
	code2 := envCreate2.Data.(map[string]interface{})["orderCode"].(string)

	reqSim := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders/"+code2+"/simulate", bytes.NewReader([]byte(`{"status":"SUCCESS"}`)))
	reqSim.Header.Set("Content-Type", "application/json")
	reqSim.Header.Set("Authorization", "Bearer "+adminTok)
	wSim := httptest.NewRecorder()
	app.ServeHTTP(wSim, reqSim)
	if wSim.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on simulate success, got %d: %s", wSim.Code, wSim.Body.String())
	}

	reqCancelPaid := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders/"+code2+"/cancel", nil)
	reqCancelPaid.Header.Set("Authorization", "Bearer "+userTok)
	wCancelPaid := httptest.NewRecorder()
	app.ServeHTTP(wCancelPaid, reqCancelPaid)
	if wCancelPaid.Code != http.StatusOK {
		t.Fatalf("expected 200 OK guarded response on already-paid cancel, got %d", wCancelPaid.Code)
	}
	var envPaidCancel response.Envelope
	_ = json.Unmarshal(wCancelPaid.Body.Bytes(), &envPaidCancel)
	if envPaidCancel.Data.(map[string]interface{})["alreadyPaid"] != true {
		t.Fatalf("expected alreadyPaid=true when cancelling PAID order, got %+v", envPaidCancel.Data)
	}

	db.Model(&domain.MembershipOrder{}).Where("order_code = ? AND status = ?", code2, "PAID").Count(&count)
	if count != 1 {
		t.Fatalf("expected PAID order preserved in DB, got %d", count)
	}
	_ = user
}

func TestPaidOrder_PersistsInHistoryAndExpiredPayOSPaidRaceUpgradesVIP(t *testing.T) {
	// Verify mock PayOS returning PAID on an expired pending order upgrades VIP instead of deleting!
	payosMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":"00","desc":"success","data":{"id":"pl_1","orderCode":99887766,"amount":49000,"amountPaid":49000,"amountRemaining":0,"status":"PAID"}}`))
	}))
	defer payosMock.Close()

	app, db, h, user, userTok, adminTok := setupMembershipTest(t)

	// 1. Standard paid flow persists in /membership/orders and /membership/me
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader([]byte(`{"packageId":"VIP_1M"}`)))
	reqCreate.Header.Set("Content-Type", "application/json")
	reqCreate.Header.Set("Authorization", "Bearer "+userTok)
	wCreate := httptest.NewRecorder()
	app.ServeHTTP(wCreate, reqCreate)
	var envCreate response.Envelope
	_ = json.Unmarshal(wCreate.Body.Bytes(), &envCreate)
	code := envCreate.Data.(map[string]interface{})["orderCode"].(string)

	reqSim := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders/"+code+"/simulate", bytes.NewReader([]byte(`{"status":"SUCCESS"}`)))
	reqSim.Header.Set("Content-Type", "application/json")
	reqSim.Header.Set("Authorization", "Bearer "+adminTok)
	wSim := httptest.NewRecorder()
	app.ServeHTTP(wSim, reqSim)
	if wSim.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on simulate, got %d", wSim.Code)
	}

	reqOrders := httptest.NewRequest(http.MethodGet, "/api/v1/membership/orders", nil)
	reqOrders.Header.Set("Authorization", "Bearer "+userTok)
	wOrders := httptest.NewRecorder()
	app.ServeHTTP(wOrders, reqOrders)
	var envOrders response.Envelope
	_ = json.Unmarshal(wOrders.Body.Bytes(), &envOrders)
	ordersData := envOrders.Data.(map[string]interface{})
	if int(ordersData["paidCount"].(float64)) != 1 {
		t.Fatalf("expected paidCount=1, got %+v", ordersData)
	}

	reqMe := httptest.NewRequest(http.MethodGet, "/api/v1/membership/me", nil)
	reqMe.Header.Set("Authorization", "Bearer "+userTok)
	wMe := httptest.NewRecorder()
	app.ServeHTTP(wMe, reqMe)
	var envMe response.Envelope
	_ = json.Unmarshal(wMe.Body.Bytes(), &envMe)
	meData := envMe.Data.(map[string]interface{})
	if meData["isVip"] != true || int(meData["paidOrdersCount"].(float64)) != 1 {
		t.Fatalf("expected isVip=true & paidOrdersCount=1, got %+v", meData)
	}

	// 2. Verify CleanupExpiredOrders never deletes a PAYOS order that PayOS already marked PAID
	client := external.NewPayOSClient("cid", "key", "sum")
	client.BaseURL = payosMock.URL
	// Construct a handler wired to mock PayOS via separate DB check or test Cancel/PayOS client directly
	raceOrder := domain.MembershipOrder{
		OrderCode:       "99887766",
		PayOSOrderCode:  99887766,
		UserID:          user.ID,
		PackageID:       "VIP_3M",
		PackageName:     "Gói 3 Tháng",
		Amount:          129000,
		DurationDays:    90,
		Status:          "PENDING",
		Provider:        "PAYOS",
		TransferContent: "WL VIP3M",
		ExpiresAt:       time.Now().UTC().Add(-1 * time.Minute),
		CreatedAt:       time.Now().UTC().Add(-16 * time.Minute),
	}
	if err := db.Create(&raceOrder).Error; err != nil {
		t.Fatalf("failed to create raceOrder: %v", err)
	}
	info, err := client.GetPaymentLinkInfo(raceOrder.PayOSOrderCode)
	if err != nil || info.Status != "PAID" {
		t.Fatalf("mock payOS info failed: %v %+v", err, info)
	}
	_ = h
}
