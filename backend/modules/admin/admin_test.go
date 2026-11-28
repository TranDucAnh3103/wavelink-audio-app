package admin_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/modules/admin"
	"audio-app-backend/modules/episode"
	"audio-app-backend/modules/taxonomy"
	"audio-app-backend/server/middleware"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const testSecret = "test-admin-secret"

type testEnv struct {
	db         *gorm.DB
	router     *gin.Engine
	adminUser  domain.User
	normalUser domain.User
	adminToken string
	userToken  string
}

func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	models := []interface{}{
		&domain.User{},
		&domain.Category{},
		&domain.Tag{},
		&domain.Audio{},
		&domain.Episode{},
		&domain.ListeningProgress{},
		&domain.ListeningHistory{},
		&domain.Favorite{},
		&domain.Notification{},
		&domain.NotificationPreference{},
		&domain.MembershipOrder{},
		&domain.SystemSetting{},
		&domain.CommunityMessage{},
		&domain.SupportTicket{},
		&domain.AdminAuditLog{},
	}
	for _, m := range models {
		if err := db.AutoMigrate(m); err != nil {
			t.Fatalf("migrate %T: %v", m, err)
		}
	}

	r := gin.New()
	r.Use(middleware.SessionMiddleware(testSecret))
	v1 := r.Group("/api/v1")
	adminH := admin.NewHandler(db)
	taxH := taxonomy.NewHandler(db)
	adminH.SetOnTaxonomyChanged(taxH.InvalidateCache)
	adminH.RegisterRoutes(v1)
	taxH.RegisterRoutes(v1)
	episode.NewHandler(db).RegisterRoutes(v1)
	v1.GET("/protected-ping", middleware.RequireAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	adm := domain.User{Username: "boss", Email: "boss@test.local", Role: domain.RoleAdmin, Membership: domain.MembershipVIP}
	usr := domain.User{Username: "alice", Email: "alice@test.local", Role: domain.RoleUser, Membership: domain.MembershipFree}
	db.Create(&adm)
	db.Create(&usr)

	admTok, _ := middleware.GenerateToken(adm, testSecret)
	usrTok, _ := middleware.GenerateToken(usr, testSecret)

	return &testEnv{
		db:         db,
		router:     r,
		adminUser:  adm,
		normalUser: usr,
		adminToken: admTok,
		userToken:  usrTok,
	}
}

func (e *testEnv) do(t *testing.T, method, path, token string, body interface{}) (int, map[string]interface{}) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)

	var out map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func TestAdminRBAC(t *testing.T) {
	env := setupTestEnv(t)

	if code, _ := env.do(t, "GET", "/api/v1/admin/dashboard", "", nil); code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", code)
	}
	if code, _ := env.do(t, "GET", "/api/v1/admin/dashboard", env.userToken, nil); code != http.StatusForbidden {
		t.Fatalf("expected 403 for USER, got %d", code)
	}
	if code, _ := env.do(t, "GET", "/api/v1/admin/dashboard", env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("expected 200 for ADMIN, got %d", code)
	}
}

func TestUserManagementLifecycle(t *testing.T) {
	env := setupTestEnv(t)

	// 1. Create user
	code, res := env.do(t, "POST", "/api/v1/admin/users", env.adminToken, map[string]interface{}{
		"username": "bob99",
		"email":    "bob99@test.local",
		"password": "secret123",
		"role":     "USER",
	})
	if code != http.StatusCreated {
		t.Fatalf("create user expected 201, got %d: %v", code, res)
	}
	createdID := uint(res["data"].(map[string]interface{})["id"].(float64))

	// 2. Grant VIP 30 days & stack another 30 days
	code, _ = env.do(t, "POST", fmt.Sprintf("/api/v1/admin/users/%d/vip", createdID), env.adminToken, map[string]int{"days": 30})
	if code != http.StatusOK {
		t.Fatalf("grant vip expected 200, got %d", code)
	}
	code, _ = env.do(t, "POST", fmt.Sprintf("/api/v1/admin/users/%d/vip", createdID), env.adminToken, map[string]int{"days": 30})
	if code != http.StatusOK {
		t.Fatalf("stack vip expected 200, got %d", code)
	}
	var bob domain.User
	env.db.First(&bob, createdID)
	if bob.Membership != domain.MembershipVIP || bob.VipExpiresAt == nil || bob.VipExpiresAt.Before(time.Now().UTC().Add(55*24*time.Hour)) {
		t.Fatalf("expected ~60 days stacked VIP, got membership=%s expires=%v", bob.Membership, bob.VipExpiresAt)
	}

	// 3. Filter VIP list
	code, listRes := env.do(t, "GET", "/api/v1/admin/users?filter=vip&q=bob", env.adminToken, nil)
	if code != http.StatusOK {
		t.Fatalf("list users expected 200, got %d", code)
	}
	items := listRes["data"].(map[string]interface{})["items"].([]interface{})
	if len(items) != 1 {
		t.Fatalf("expected 1 vip user matching bob, got %d", len(items))
	}

	// 4. Reset password
	code, _ = env.do(t, "POST", fmt.Sprintf("/api/v1/admin/users/%d/password", createdID), env.adminToken, map[string]string{"password": "newpassword123"})
	if code != http.StatusOK {
		t.Fatalf("reset password expected 200, got %d", code)
	}
	env.db.First(&bob, createdID)
	if err := bcrypt.CompareHashAndPassword([]byte(bob.PasswordHash), []byte("newpassword123")); err != nil {
		t.Fatalf("password hash did not update: %v", err)
	}

	// 5. Ban immediately invalidates active JWT token, unban restores it
	bobTok, _ := middleware.GenerateToken(bob, testSecret)
	if code, _ := env.do(t, "GET", "/api/v1/protected-ping", bobTok, nil); code != http.StatusOK {
		t.Fatalf("expected active user token to work before ban, got %d", code)
	}
	if code, _ := env.do(t, "POST", fmt.Sprintf("/api/v1/admin/users/%d/ban", createdID), env.adminToken, map[string]string{"reason": "spam"}); code != http.StatusOK {
		t.Fatalf("ban expected 200, got %d", code)
	}
	if code, _ := env.do(t, "GET", "/api/v1/protected-ping", bobTok, nil); code != http.StatusUnauthorized {
		t.Fatalf("expected banned user token to be rejected with 401, got %d", code)
	}
	if code, _ := env.do(t, "POST", fmt.Sprintf("/api/v1/admin/users/%d/unban", createdID), env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("unban expected 200, got %d", code)
	}
	if code, _ := env.do(t, "GET", "/api/v1/protected-ping", bobTok, nil); code != http.StatusOK {
		t.Fatalf("expected unbanned user token to work again, got %d", code)
	}

	// 6. Self-protection & last-admin protection
	if code, _ := env.do(t, "PATCH", fmt.Sprintf("/api/v1/admin/users/%d", env.adminUser.ID), env.adminToken, map[string]string{"role": "USER"}); code != http.StatusBadRequest {
		t.Fatalf("expected 400 when self-demoting admin, got %d", code)
	}
	if code, _ := env.do(t, "DELETE", fmt.Sprintf("/api/v1/admin/users/%d", env.adminUser.ID), env.adminToken, nil); code != http.StatusBadRequest {
		t.Fatalf("expected 400 when self-deleting admin, got %d", code)
	}

	// 7. Notify & Detail & Delete
	if code, _ := env.do(t, "POST", fmt.Sprintf("/api/v1/admin/users/%d/notify", createdID), env.adminToken, map[string]string{"title": "Hi", "message": "Welcome"}); code != http.StatusOK {
		t.Fatalf("notify expected 200, got %d", code)
	}
	if code, _ := env.do(t, "GET", fmt.Sprintf("/api/v1/admin/users/%d", createdID), env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("detail expected 200, got %d", code)
	}
	if code, _ := env.do(t, "DELETE", fmt.Sprintf("/api/v1/admin/users/%d", createdID), env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("delete user expected 200, got %d", code)
	}
	var count int64
	env.db.Model(&domain.Notification{}).Where("user_id = ?", createdID).Count(&count)
	if count != 0 {
		t.Fatalf("expected user notifications to be deleted on user removal, remaining=%d", count)
	}
}

func TestOrdersAudiosAndBroadcast(t *testing.T) {
	env := setupTestEnv(t)

	// Seed order
	order := domain.MembershipOrder{
		OrderCode:    "ORD-1001",
		UserID:       env.normalUser.ID,
		PackageID:    "VIP_1M",
		PackageName:  "Gói 1 Tháng",
		Amount:       49000,
		DurationDays: 30,
		Status:       "PENDING",
		ExpiresAt:    time.Now().UTC().Add(15 * time.Minute),
	}
	env.db.Create(&order)

	// Confirm order -> activates VIP
	if code, _ := env.do(t, "POST", "/api/v1/admin/orders/ORD-1001/confirm", env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("confirm order expected 200, got %d", code)
	}
	var alice domain.User
	env.db.First(&alice, env.normalUser.ID)
	if alice.Membership != domain.MembershipVIP {
		t.Fatalf("expected alice to become VIP after order confirm, got %s", alice.Membership)
	}

	// Refund order -> reverts VIP to FREE
	if code, _ := env.do(t, "POST", "/api/v1/admin/orders/ORD-1001/refund", env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("refund order expected 200, got %d", code)
	}
	env.db.First(&alice, env.normalUser.ID)
	if alice.Membership != domain.MembershipFree {
		t.Fatalf("expected alice to revert to FREE after refund, got %s", alice.Membership)
	}

	// Seed audio & bulk update
	audio := domain.Audio{
		YoutubeVideoID: "abc12345678",
		YoutubeURL:     "https://youtube.com/watch?v=abc12345678",
		Title:          "Truyện Thử Nghiệm",
		Status:         domain.StatusActive,
		StreamStatus:   domain.StreamStatusFailed,
	}
	env.db.Create(&audio)

	code, audioRes := env.do(t, "GET", "/api/v1/admin/audios?stream=FAILED", env.adminToken, nil)
	if code != http.StatusOK {
		t.Fatalf("list audios expected 200, got %d", code)
	}
	if len(audioRes["data"].(map[string]interface{})["items"].([]interface{})) != 1 {
		t.Fatalf("expected 1 failed audio")
	}

	if code, _ := env.do(t, "POST", "/api/v1/admin/audios/bulk", env.adminToken, map[string]interface{}{
		"ids":    []uint{audio.ID},
		"action": "hide",
	}); code != http.StatusOK {
		t.Fatalf("bulk hide expected 200, got %d", code)
	}
	env.db.First(&audio, audio.ID)
	if audio.Status != domain.StatusHidden {
		t.Fatalf("expected audio status HIDDEN, got %s", audio.Status)
	}

	// Broadcast to free users
	code, bcRes := env.do(t, "POST", "/api/v1/admin/broadcast", env.adminToken, map[string]string{
		"title":    "Khuyến mãi",
		"message":  "Giảm 20%",
		"type":     "PROMOTION",
		"audience": "free",
	})
	if code != http.StatusOK {
		t.Fatalf("broadcast expected 200, got %d", code)
	}
	if int(bcRes["data"].(map[string]interface{})["delivered"].(float64)) != 1 {
		t.Fatalf("expected 1 delivered notification to free audience, got %v", bcRes)
	}

	// Dashboard summary
	code, dashRes := env.do(t, "GET", "/api/v1/admin/dashboard", env.adminToken, nil)
	if code != http.StatusOK {
		t.Fatalf("dashboard expected 200, got %d", code)
	}
	dash := dashRes["data"].(map[string]interface{})
	if len(dash["series"].([]interface{})) != 14 {
		t.Fatalf("expected 14-day series in dashboard")
	}
}

func TestEpisodesTaxonomyTicketsSystemAndAudit(t *testing.T) {
	env := setupTestEnv(t)

	// 1. Taxonomy: create, merge categories, update/merge/cleanup tags
	catA := domain.Category{Name: "Thể loại A", Slug: "cat-a"}
	catB := domain.Category{Name: "Thể loại B", Slug: "cat-b"}
	env.db.Create(&catA)
	env.db.Create(&catB)

	audio := domain.Audio{
		YoutubeVideoID:       "vid12345678",
		YoutubeURL:           "https://youtube.com/watch?v=vid12345678",
		Title:                "Bộ Truyện Test",
		TotalDurationSeconds: 7200,
		CategoryID:           catA.ID,
		Status:               domain.StatusActive,
		CreatedBy:            env.normalUser.ID,
	}
	env.db.Create(&audio)

	if code, _ := env.do(t, "POST", "/api/v1/categories/merge", env.adminToken, map[string]uint{
		"sourceId": catA.ID,
		"targetId": catB.ID,
	}); code != http.StatusOK {
		t.Fatalf("merge categories expected 200, got %d", code)
	}
	env.db.First(&audio, audio.ID)
	if audio.CategoryID != catB.ID {
		t.Fatalf("expected audio category reassigned to %d, got %d", catB.ID, audio.CategoryID)
	}

	tag1 := domain.Tag{Name: "Tiên Hiệp", Slug: "tien-hiep"}
	tag2 := domain.Tag{Name: "Tu Tiên", Slug: "tu-tien"}
	tagEmpty := domain.Tag{Name: "Rác", Slug: "rac"}
	env.db.Create(&tag1)
	env.db.Create(&tag2)
	env.db.Create(&tagEmpty)
	env.db.Exec("INSERT INTO audio_tags (audio_id, tag_id) VALUES (?, ?)", audio.ID, tag1.ID)

	if code, _ := env.do(t, "PUT", fmt.Sprintf("/api/v1/tags/%d", tag2.ID), env.adminToken, map[string]string{
		"name": "Tu Chân",
		"slug": "tu-chan",
	}); code != http.StatusOK {
		t.Fatalf("update tag expected 200, got %d", code)
	}
	if code, _ := env.do(t, "POST", "/api/v1/tags/merge", env.adminToken, map[string]interface{}{
		"sourceIds": []uint{tag1.ID},
		"targetId":  tag2.ID,
	}); code != http.StatusOK {
		t.Fatalf("merge tags expected 200, got %d", code)
	}
	if code, _ := env.do(t, "DELETE", "/api/v1/tags/unused", env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("cleanup unused tags expected 200, got %d", code)
	}
	var tagCount int64
	env.db.Model(&domain.Tag{}).Count(&tagCount)
	if tagCount != 1 {
		t.Fatalf("expected only merged target tag remaining, got %d", tagCount)
	}

	// 2. Episodes: batch chapters, overlap rejection, per-ep VIP, delete renumbers
	if code, _ := env.do(t, "POST", fmt.Sprintf("/api/v1/admin/audios/%d/episodes/batch-chapters", audio.ID), env.adminToken, map[string]string{
		"rawText": "00:00 Tập 1\n30:00 Tập 2\n01:00:00 Tập 3",
	}); code != http.StatusOK {
		t.Fatalf("batch chapters expected 200, got %d", code)
	}
	if code, _ := env.do(t, "POST", "/api/v1/episodes", env.adminToken, map[string]interface{}{
		"audioId":      audio.ID,
		"title":        "Trùng",
		"startSeconds": 100,
		"endSeconds":   500,
	}); code != http.StatusBadRequest {
		t.Fatalf("expected 400 on overlapping episode, got %d", code)
	}

	var eps []domain.Episode
	env.db.Where("audio_id = ?", audio.ID).Order("episode_number ASC").Find(&eps)
	if len(eps) != 3 {
		t.Fatalf("expected 3 episodes, got %d", len(eps))
	}
	if code, _ := env.do(t, "PUT", fmt.Sprintf("/api/v1/episodes/%d", eps[0].ID), env.adminToken, map[string]interface{}{
		"isVip": true,
	}); code != http.StatusOK {
		t.Fatalf("update episode vip expected 200, got %d", code)
	}
	if code, _ := env.do(t, "DELETE", fmt.Sprintf("/api/v1/episodes/%d", eps[1].ID), env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("delete episode expected 200, got %d", code)
	}
	env.db.Where("audio_id = ?", audio.ID).Order("episode_number ASC").Find(&eps)
	if len(eps) != 2 || eps[0].EpisodeNumber != 1 || eps[1].EpisodeNumber != 2 {
		t.Fatalf("expected sequential renumbering 1..2 after delete, got %+v", eps)
	}

	// 3. Tickets, Settings, Audit Log, Import Stats & CSV Export
	ticket := domain.SupportTicket{
		UserID:   env.normalUser.ID,
		Username: env.normalUser.Username,
		Kind:     "REFUND",
		Subject:  "Hoàn tiền đơn 1",
		Content:  "Nhầm gói",
		Status:   "PENDING",
	}
	env.db.Create(&ticket)
	if code, _ := env.do(t, "PATCH", fmt.Sprintf("/api/v1/admin/tickets/%d", ticket.ID), env.adminToken, map[string]string{
		"status":    "RESOLVED",
		"adminNote": "Đã hoàn tiền",
	}); code != http.StatusOK {
		t.Fatalf("update ticket expected 200, got %d", code)
	}

	if code, _ := env.do(t, "PUT", "/api/v1/admin/settings", env.adminToken, map[string]interface{}{
		"freeImportDailyLimit": 12,
		"allowUserImport":      true,
		"allowGuestChat":       false,
		"maintenanceMode":      false,
	}); code != http.StatusOK {
		t.Fatalf("update settings expected 200, got %d", code)
	}

	if code, impRes := env.do(t, "GET", "/api/v1/admin/imports/stats", env.adminToken, nil); code != http.StatusOK || int(impRes["data"].(map[string]interface{})["dailyLimit"].(float64)) != 12 {
		t.Fatalf("import stats expected dailyLimit=12, got %d %v", code, impRes)
	}

	if code, logRes := env.do(t, "GET", "/api/v1/admin/audit-logs", env.adminToken, nil); code != http.StatusOK || len(logRes["data"].(map[string]interface{})["items"].([]interface{})) == 0 {
		t.Fatalf("expected non-empty audit logs, got %d %v", code, logRes)
	}

	req := httptest.NewRequest("GET", "/api/v1/admin/export/users", nil)
	req.Header.Set("Authorization", "Bearer "+env.adminToken)
	w := httptest.NewRecorder()
	env.router.ServeHTTP(w, req)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Username") {
		t.Fatalf("expected CSV export with Username header, got %d", w.Code)
	}
}

func TestLiveRoleSyncMaintenanceAndOrderEdgeCases(t *testing.T) {
	env := setupTestEnv(t)
	middleware.SetAuthDB(env.db)
	defer middleware.SetAuthDB(nil)
	middleware.InvalidateSiteConfigCache()

	// Wrap a router with MaintenanceGuard to test 503 enforcement cleanly
	r := gin.New()
	r.Use(middleware.SessionMiddleware(testSecret))
	v1 := r.Group("/api/v1")
	v1.Use(middleware.MaintenanceGuard(env.db))
	admin.NewHandler(env.db).RegisterRoutes(v1)
	v1.GET("/public-ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	env.router = r

	// 1. Live role promotion -> existing user JWT works on admin route immediately
	if code, _ := env.do(t, "PATCH", fmt.Sprintf("/api/v1/admin/users/%d", env.normalUser.ID), env.adminToken, map[string]string{
		"role":  "ADMIN",
		"email": "",
	}); code != http.StatusOK {
		t.Fatalf("promote user expected 200, got %d", code)
	}
	var promoted domain.User
	env.db.First(&promoted, env.normalUser.ID)
	if !strings.HasSuffix(promoted.Email, "@user.local") {
		t.Fatalf("expected cleared email to get synthetic suffix, got %q", promoted.Email)
	}
	if code, _ := env.do(t, "GET", "/api/v1/admin/dashboard", env.userToken, nil); code != http.StatusOK {
		t.Fatalf("promoted user token expected immediate 200 on admin route, got %d", code)
	}

	// Switch user to VIP via UpdateUser, then verify old token loses admin immediately
	if code, _ := env.do(t, "PATCH", fmt.Sprintf("/api/v1/admin/users/%d", env.normalUser.ID), env.adminToken, map[string]string{
		"role": "VIP",
	}); code != http.StatusOK {
		t.Fatalf("set VIP role expected 200, got %d", code)
	}
	if code, _ := env.do(t, "GET", "/api/v1/admin/dashboard", env.userToken, nil); code != http.StatusForbidden {
		t.Fatalf("demoted user token expected immediate 403 on admin route, got %d", code)
	}

	// 2. MaintenanceMode blocks normal users with 503 MAINTENANCE_MODE while admin bypasses
	if code, _ := env.do(t, "PUT", "/api/v1/admin/settings", env.adminToken, map[string]interface{}{
		"freeImportDailyLimit": 5,
		"allowUserImport":      true,
		"allowGuestChat":       true,
		"maintenanceMode":      true,
		"maintenanceMessage":   "Bảo trì định kỳ",
	}); code != http.StatusOK {
		t.Fatalf("enable maintenance expected 200, got %d", code)
	}
	if code, body := env.do(t, "GET", "/api/v1/public-ping", env.userToken, nil); code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 during maintenance for non-admin, got %d %v", code, body)
	}
	if code, _ := env.do(t, "GET", "/api/v1/public-ping", env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("expected 200 for admin during maintenance, got %d", code)
	}

	// 3. Expired PENDING order shows under EXPIRED & cannot be confirmed; refund without VipExpiresAt still downgrades
	expiredAt := time.Now().UTC().Add(-2 * time.Hour)
	expOrder := domain.MembershipOrder{
		OrderCode:    "ORD-EXP-1",
		UserID:       env.normalUser.ID,
		PackageID:    "VIP_1M",
		PackageName:  "1 Tháng",
		Amount:       49000,
		DurationDays: 30,
		Status:       "PENDING",
		Provider:     "VIETQR",
		ExpiresAt:    expiredAt,
	}
	env.db.Create(&expOrder)
	if code, res := env.do(t, "GET", "/api/v1/admin/orders?status=EXPIRED", env.adminToken, nil); code != http.StatusOK || int(res["data"].(map[string]interface{})["total"].(float64)) != 1 {
		t.Fatalf("expected expired pending order in EXPIRED filter, got %d %v", code, res)
	}

	// Cancel then ensure Confirm rejects CANCELLED order
	if code, _ := env.do(t, "POST", "/api/v1/admin/orders/ORD-EXP-1/cancel", env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("cancel pending order expected 200, got %d", code)
	}
	if code, _ := env.do(t, "POST", "/api/v1/admin/orders/ORD-EXP-1/confirm", env.adminToken, nil); code != http.StatusBadRequest {
		t.Fatalf("expected 400 confirming cancelled order, got %d", code)
	}

	// Paid order refund when user has nil VipExpiresAt
	env.db.Model(&domain.User{}).Where("id = ?", env.normalUser.ID).Updates(map[string]interface{}{
		"role":           domain.RoleVIP,
		"membership":     domain.MembershipVIP,
		"vip_expires_at": nil,
	})
	now := time.Now().UTC()
	paidOrder := domain.MembershipOrder{
		OrderCode:    "ORD-NIL-EXP",
		UserID:       env.normalUser.ID,
		PackageID:    "VIP_1M",
		PackageName:  "1 Tháng",
		Amount:       49000,
		DurationDays: 30,
		Status:       "PAID",
		Provider:     "VIETQR",
		PaidAt:       &now,
		ExpiresAt:    now.Add(time.Hour),
	}
	env.db.Create(&paidOrder)
	if code, _ := env.do(t, "POST", "/api/v1/admin/orders/ORD-NIL-EXP/refund", env.adminToken, nil); code != http.StatusOK {
		t.Fatalf("refund order expected 200, got %d", code)
	}
	var afterRefund domain.User
	env.db.First(&afterRefund, env.normalUser.ID)
	if afterRefund.Role != domain.RoleUser || afterRefund.Membership != domain.MembershipFree {
		t.Fatalf("expected user downgraded on refund even with nil vip_expires_at, got role=%s membership=%s", afterRefund.Role, afterRefund.Membership)
	}
}
