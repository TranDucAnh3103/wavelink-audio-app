package history_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"audio-app-backend/core/domain"
	infraDB "audio-app-backend/infra/db"
	"audio-app-backend/modules/history"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
)

func TestGetRecentHistory_ReturnsAllDistinctAudiosDespiteManyHeartbeats(t *testing.T) {
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
		Username:     "historytester",
		Email:        "history@test.local",
		PasswordHash: "hash",
		Role:         domain.RoleUser,
		Membership:   domain.MembershipFree,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	episodes := make([]domain.Episode, 6)
	for i := 0; i < 6; i++ {
		a := domain.Audio{
			YoutubeVideoID:       fmt.Sprintf("histVid%04d", i+1),
			YoutubeURL:           fmt.Sprintf("https://www.youtube.com/watch?v=histVid%04d", i+1),
			Title:                fmt.Sprintf("Audio History %d", i+1),
			Author:               "Author",
			TotalDurationSeconds: 7200,
			Status:               domain.StatusActive,
		}
		if err := db.Create(&a).Error; err != nil {
			t.Fatalf("failed to create audio %d: %v", i+1, err)
		}
		ep := domain.Episode{
			AudioID:         a.ID,
			EpisodeNumber:   1,
			Title:           "Tập 1",
			StartSeconds:    0,
			EndSeconds:      7200,
			DurationSeconds: 7200,
		}
		if err := db.Create(&ep).Error; err != nil {
			t.Fatalf("failed to create episode %d: %v", i+1, err)
		}
		episodes[i] = ep
	}

	now := time.Now().UTC()

	// Insert 120 recent heartbeat history rows across the top 3 audios (previously truncatedLimit(100))
	for i := 0; i < 120; i++ {
		ep := episodes[i%3]
		rec := domain.ListeningHistory{
			UserID:           user.ID,
			AudioID:          ep.AudioID,
			EpisodeID:        ep.ID,
			DurationListened: 60,
			StartedAt:        now.Add(-time.Duration(i+1) * time.Minute),
			CreatedAt:        now.Add(-time.Duration(i) * time.Second),
		}
		if err := db.Create(&rec).Error; err != nil {
			t.Fatalf("failed to seed history row %d: %v", i, err)
		}
	}

	// Insert older history rows for audios #4 and #5
	for _, idx := range []int{3, 4} {
		ep := episodes[idx]
		rec := domain.ListeningHistory{
			UserID:           user.ID,
			AudioID:          ep.AudioID,
			EpisodeID:        ep.ID,
			DurationListened: 180,
			StartedAt:        now.Add(-time.Duration(idx) * time.Hour),
			CreatedAt:        now.Add(-time.Duration(idx) * time.Hour),
		}
		if err := db.Create(&rec).Error; err != nil {
			t.Fatalf("failed to seed older audio %d: %v", idx+1, err)
		}
	}

	// Insert ListeningProgress for all 6 audios (audio #6 has only ListeningProgress)
	for i, ep := range episodes {
		prog := domain.ListeningProgress{
			UserID:          user.ID,
			AudioID:         ep.AudioID,
			EpisodeID:       ep.ID,
			PositionSeconds: 300 + i*10,
			DurationSeconds: 7200,
			ProgressPercent: 5,
			UpdatedAt:       now.Add(-time.Duration(i+1) * time.Minute),
		}
		if err := db.Create(&prog).Error; err != nil {
			t.Fatalf("failed to seed progress %d: %v", i+1, err)
		}
	}

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", user.ID)
		c.Next()
	})
	h := history.NewHandler(db)
	r.GET("/api/v1/history", h.GetRecentHistory)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/history", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var env response.Envelope
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("invalid json response: %v", err)
	}

	rawItems, ok := env.Data.([]interface{})
	if !ok {
		t.Fatalf("expected array data, got %T", env.Data)
	}

	if len(rawItems) != 6 {
		t.Fatalf("expected all 6 distinct audios in history, got %d", len(rawItems))
	}

	seen := make(map[uint]bool)
	for _, raw := range rawItems {
		item := raw.(map[string]interface{})
		aID := uint(item["audioId"].(float64))
		if seen[aID] {
			t.Fatalf("duplicate audioId %d found in consolidated history", aID)
		}
		seen[aID] = true
	}

	// Verify chunked pagination (?page=1&limit=2) returns sliced rows with total=6
	reqPaged := httptest.NewRequest(http.MethodGet, "/api/v1/history?page=1&limit=2", nil)
	wPaged := httptest.NewRecorder()
	r.ServeHTTP(wPaged, reqPaged)
	if wPaged.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for paged history, got %d", wPaged.Code)
	}

	var pagedEnv struct {
		Success bool                     `json:"success"`
		Data    []map[string]interface{} `json:"data"`
		Meta    map[string]interface{}   `json:"meta"`
	}
	if err := json.Unmarshal(wPaged.Body.Bytes(), &pagedEnv); err != nil {
		t.Fatalf("invalid paged json response: %v", err)
	}
	if len(pagedEnv.Data) != 2 {
		t.Fatalf("expected 2 history items on page=1&limit=2, got %d", len(pagedEnv.Data))
	}
	if total := int(pagedEnv.Meta["total"].(float64)); total != 6 {
		t.Fatalf("expected meta.total=6, got %d", total)
	}
	if totalPages := int(pagedEnv.Meta["totalPages"].(float64)); totalPages != 3 {
		t.Fatalf("expected meta.totalPages=3, got %d", totalPages)
	}
}
