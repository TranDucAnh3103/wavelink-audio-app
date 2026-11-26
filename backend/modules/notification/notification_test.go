package notification

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/middleware"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupNotifTest(t *testing.T) (*gorm.DB, *gin.Engine, domain.User, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_ = db.AutoMigrate(&domain.User{}, &domain.Notification{}, &domain.NotificationPreference{})

	u := domain.User{Username: "reader", Email: "reader@test.local", Role: domain.RoleUser, Membership: domain.MembershipFree}
	db.Create(&u)
	tok, _ := middleware.GenerateToken(u, "notif-secret")

	r := gin.New()
	r.Use(middleware.SessionMiddleware("notif-secret"))
	NewHandler(db).RegisterRoutes(r.Group("/api/v1"))
	return db, r, u, tok
}

func TestCreateSafeNotificationAndFilters(t *testing.T) {
	db, r, u, tok := setupNotifTest(t)

	// 1. Seed welcome notifications on first GET (clean BrowserRouter paths, no #/)
	req := httptest.NewRequest("GET", "/api/v1/notifications", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var env struct {
		Data []domain.Notification `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &env)
	if len(env.Data) != 3 {
		t.Fatalf("expected 3 welcome notifications, got %d", len(env.Data))
	}
	for _, n := range env.Data {
		if len(n.Link) >= 2 && n.Link[:2] == "#/" {
			t.Fatalf("expected clean BrowserRouter link without #/, got %q", n.Link)
		}
	}

	// 2. CreateSafeNotification deduplicates identical titles within 10m
	ok, _ := CreateSafeNotification(db, domain.Notification{UserID: u.ID, Title: "Tin mới", Message: "A", Type: "SYSTEM"})
	if !ok {
		t.Fatalf("expected first notification to succeed")
	}
	dup, _ := CreateSafeNotification(db, domain.Notification{UserID: u.ID, Title: "Tin mới", Message: "B", Type: "SYSTEM"})
	if dup {
		t.Fatalf("expected duplicate title within 10m to be suppressed")
	}

	// 3. Respects BlockAll preference
	db.Model(&domain.NotificationPreference{}).Where("user_id = ?", u.ID).Update("block_all", true)
	blocked, _ := CreateSafeNotification(db, domain.Notification{UserID: u.ID, Title: "Tin khác", Message: "C", Type: "VIP"})
	if blocked {
		t.Fatalf("expected notification to be blocked when block_all=true")
	}

	// 4. Filter query (?type=VIP&filter=unread)
	req2 := httptest.NewRequest("GET", "/api/v1/notifications?filter=unread&type=VIP", nil)
	req2.Header.Set("Authorization", "Bearer "+tok)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	var env2 struct {
		Data []domain.Notification `json:"data"`
	}
	_ = json.Unmarshal(w2.Body.Bytes(), &env2)
	if len(env2.Data) != 1 || env2.Data[0].Type != "VIP" {
		t.Fatalf("expected 1 unread VIP notification, got %+v", env2.Data)
	}

	// 5. Hub.PushToUser delivers serialized notification to connected client buffer
	hub := getDefaultHub()
	ch := make(chan []byte, 4)
	client := &wsClient{hub: hub, userID: u.ID, send: ch}
	hub.register(client)
	defer hub.unregister(client)

	hub.PushToUser(u.ID, domain.Notification{ID: 99, UserID: u.ID, Title: "Push", CreatedAt: time.Now().UTC()})
	select {
	case raw := <-ch:
		var pkt wsEnvelope
		if err := json.Unmarshal(raw, &pkt); err != nil || pkt.Type != "notification" {
			t.Fatalf("unexpected ws packet: %s", string(raw))
		}
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for hub push")
	}
}
