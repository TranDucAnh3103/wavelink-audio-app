package audio_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"audio-app-backend/core/domain"
	infraDB "audio-app-backend/infra/db"
	"audio-app-backend/modules/audio"

	"github.com/gin-gonic/gin"
)

func TestListAudios_FieldsLiteOmitsDescriptionAndResolvesNextResumeEpisode(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, err := infraDB.InitDatabase("sqlite", ":memory:", false)
	if err != nil {
		t.Fatalf("failed to init sqlite db: %v", err)
	}
	sqlDB, _ := db.DB()
	if sqlDB != nil {
		sqlDB.SetMaxOpenConns(1)
		t.Cleanup(func() { _ = sqlDB.Close() })
	}

	if err := infraDB.AutoMigrate(db); err != nil {
		t.Fatalf("failed to migrate db: %v", err)
	}

	user := domain.User{
		Username:     "litetester",
		Email:        "lite@test.local",
		PasswordHash: "hash",
		Role:         domain.RoleUser,
		Membership:   domain.MembershipFree,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	item := domain.Audio{
		YoutubeVideoID:       "liteVid0001",
		YoutubeURL:           "https://www.youtube.com/watch?v=liteVid0001",
		Title:                "Lite Payload Test Audio",
		Description:          "Very long description that must be omitted in fields=lite responses",
		Author:               "Author",
		TotalDurationSeconds: 10800,
		Status:               domain.StatusActive,
	}
	if err := db.Create(&item).Error; err != nil {
		t.Fatalf("failed to create audio: %v", err)
	}

	var eps []domain.Episode
	for n := 1; n <= 3; n++ {
		ep := domain.Episode{
			AudioID:         item.ID,
			EpisodeNumber:   n,
			Title:           "Tập",
			StartSeconds:    (n - 1) * 3600,
			EndSeconds:      n * 3600,
			DurationSeconds: 3600,
		}
		if err := db.Create(&ep).Error; err != nil {
			t.Fatalf("failed to create ep %d: %v", n, err)
		}
		eps = append(eps, ep)
	}

	// Mark Episode 1 as completed so resume state should advance to Episode 2
	prog := domain.ListeningProgress{
		UserID:          user.ID,
		AudioID:         item.ID,
		EpisodeID:       eps[0].ID,
		PositionSeconds: 3600,
		DurationSeconds: 3600,
		ProgressPercent: 100,
		Completed:       true,
		UpdatedAt:       time.Now().UTC(),
	}
	if err := db.Create(&prog).Error; err != nil {
		t.Fatalf("failed to seed progress: %v", err)
	}

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", user.ID)
		c.Next()
	})
	h := audio.NewHandler(db)
	r.GET("/api/v1/audios", h.ListAudios)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/audios?fields=lite&page=1&limit=12", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var env struct {
		Success bool                     `json:"success"`
		Data    []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if len(env.Data) != 1 {
		t.Fatalf("expected 1 audio, got %d", len(env.Data))
	}

	got := env.Data[0]
	if desc, _ := got["description"].(string); desc != "" {
		t.Fatalf("expected empty description in fields=lite, got %q", desc)
	}
	if totalEps := int(got["totalEpisodes"].(float64)); totalEps != 3 {
		t.Fatalf("expected totalEpisodes=3, got %d", totalEps)
	}
	if curEp := int(got["currentEpisodeNumber"].(float64)); curEp != 2 {
		t.Fatalf("expected currentEpisodeNumber=2 after completing ep 1, got %d", curEp)
	}
	episodesField, _ := got["episodes"].([]interface{})
	if len(episodesField) != 1 {
		t.Fatalf("expected only 1 active episode returned in fields=lite, got %d", len(episodesField))
	}
}

func TestListAudios_FieldsCatalogReturnsLightweightSummaryForAllAudios(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, err := infraDB.InitDatabase("sqlite", ":memory:", false)
	if err != nil {
		t.Fatalf("failed to init sqlite db: %v", err)
	}
	sqlDB, _ := db.DB()
	if sqlDB != nil {
		sqlDB.SetMaxOpenConns(1)
		t.Cleanup(func() { _ = sqlDB.Close() })
	}

	if err := infraDB.AutoMigrate(db); err != nil {
		t.Fatalf("failed to migrate db: %v", err)
	}

	cat := domain.Category{Name: "Huyền Huyễn", Slug: "huyen-huyen"}
	if err := db.Create(&cat).Error; err != nil {
		t.Fatalf("failed to create category: %v", err)
	}

	for i := 1; i <= 3; i++ {
		a := domain.Audio{
			YoutubeVideoID:       fmt.Sprintf("catVid%04d", i),
			YoutubeURL:           fmt.Sprintf("https://www.youtube.com/watch?v=catVid%04d", i),
			Title:                fmt.Sprintf("Truyện Dài Tập - Phần %d", i),
			Description:          "Very long description omitted in catalog mode",
			Author:               "Tác Giả A",
			CategoryID:           cat.ID,
			TotalDurationSeconds: 14400,
			Status:               domain.StatusActive,
		}
		if err := db.Create(&a).Error; err != nil {
			t.Fatalf("failed to create audio %d: %v", i, err)
		}
		for epNum := 1; epNum <= 2; epNum++ {
			_ = db.Create(&domain.Episode{
				AudioID:         a.ID,
				EpisodeNumber:   epNum,
				Title:           fmt.Sprintf("Tập %d", epNum),
				StartSeconds:    (epNum - 1) * 7200,
				EndSeconds:      epNum * 7200,
				DurationSeconds: 7200,
			}).Error
		}
	}

	r := gin.New()
	h := audio.NewHandler(db)
	r.GET("/api/v1/audios", h.ListAudios)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/audios?fields=catalog&all=true&limit=0", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}
	if cc := w.Header().Get("Cache-Control"); cc == "" {
		t.Fatalf("expected Cache-Control header on catalog response")
	}

	var env struct {
		Success bool                     `json:"success"`
		Data    []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if len(env.Data) != 3 {
		t.Fatalf("expected all 3 catalog items, got %d", len(env.Data))
	}
	first := env.Data[0]
	if desc, _ := first["description"].(string); desc != "" {
		t.Fatalf("expected empty description in catalog mode, got %q", desc)
	}
	if _, hasEpisodes := first["episodes"]; hasEpisodes {
		t.Fatalf("expected no episodes array in catalog mode")
	}
	if totalEps := int(first["totalEpisodes"].(float64)); totalEps != 2 {
		t.Fatalf("expected totalEpisodes=2 in catalog mode, got %d", totalEps)
	}
}
