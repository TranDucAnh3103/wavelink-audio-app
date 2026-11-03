package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"audio-app-backend/config"
	"audio-app-backend/core/domain"
	infraDB "audio-app-backend/infra/db"
	"audio-app-backend/server"
	"audio-app-backend/server/response"
	"gorm.io/gorm"
)

func setupTestApp(t *testing.T) (http.Handler, *gorm.DB) {
	testDBPath := "test_audio_library.db"
	_ = os.Remove(testDBPath)

	cfg := &config.Config{
		Port:            "8080",
		DBDriver:        "sqlite",
		DBSource:        testDBPath,
		JWTSecret:       "test-secret-key-1234567890123456",
		StaticDir:       "../../frontend",
		EpisodeBlockSec: 14400,
		AllowedOrigins:  "*",
	}

	db, err := infraDB.InitDatabase(cfg.DBDriver, cfg.DBSource, false)
	if err != nil {
		t.Fatalf("Failed to init test database: %v", err)
	}

	if err := infraDB.AutoMigrate(db); err != nil {
		t.Fatalf("Failed to auto-migrate test database: %v", err)
	}
	if err := infraDB.SeedInitialData(db, false); err != nil {
		t.Fatalf("Failed to seed test database: %v", err)
	}

	t.Cleanup(func() {
		sqlDB, _ := db.DB()
		if sqlDB != nil {
			_ = sqlDB.Close()
		}
		_ = os.Remove(testDBPath)
	})

	return server.SetupRouter(cfg, db), db
}

func TestEndToEndAPI(t *testing.T) {
	app, db := setupTestApp(t)

	// 1. Healthcheck
	t.Run("Health check", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", w.Code)
		}
	})

	// 2. Guest 1-Click Login (Không lưu vào DB)
	t.Run("Guest 1-Click Login (No DB Insertion)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/guest", nil)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var res response.Envelope
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("Invalid JSON: %v", err)
		}
		if !res.Success {
			t.Fatalf("Expected success=true, got error: %+v", res.Error)
		}

		dataMap := res.Data.(map[string]interface{})
		userMap := dataMap["user"].(map[string]interface{})
		if userMap["isGuest"] != true {
			t.Fatalf("Expected isGuest=true, got %v", userMap["isGuest"])
		}

		// Bảo đảm không có bản ghi khách nào được lưu trong bảng users
		var guestCount int64
		db.Model(&domain.User{}).Where("is_guest = 1").Count(&guestCount)
		if guestCount != 0 {
			t.Fatalf("Expected 0 guest records in DB, found %d", guestCount)
		}

		// Khách chưa đăng nhập nên không thể gọi PUT /progress trực tiếp lên DB
		progPayload := map[string]interface{}{
			"audioId":         1,
			"episodeId":       1,
			"positionSeconds": 100,
			"progressPercent": 10.0,
		}
		progBody, _ := json.Marshal(progPayload)
		progReq := httptest.NewRequest(http.MethodPut, "/api/v1/progress", bytes.NewReader(progBody))
		progReq.Header.Set("Content-Type", "application/json")
		progW := httptest.NewRecorder()
		app.ServeHTTP(progW, progReq)
		if progW.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401 Unauthorized for guest updating progress without account, got %d", progW.Code)
		}
	})

	// 3. User Login (để test các thao tác cần tài khoản như lưu tiến trình, lịch sử vào DB)
	var userToken string
	t.Run("User Login", func(t *testing.T) {
		payload := map[string]string{
			"username": "user123",
			"password": "user123",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var res response.Envelope
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		dataMap := res.Data.(map[string]interface{})
		userToken = dataMap["token"].(string)
		if userToken == "" {
			t.Fatal("User token is empty")
		}
	})

	// 3b. Admin Login
	var adminToken string
	t.Run("Admin Login", func(t *testing.T) {
		payload := map[string]string{
			"username": "admin",
			"password": "admin123",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var res response.Envelope
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		dataMap := res.Data.(map[string]interface{})
		adminToken = dataMap["token"].(string)
		if adminToken == "" {
			t.Fatal("Admin token is empty")
		}
	})

	// 4. List Categories
	t.Run("List Categories with Counts", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/categories", nil)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", w.Code)
		}
		var res response.Envelope
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		cats := res.Data.([]interface{})
		if len(cats) == 0 {
			t.Fatal("Expected seeded categories, got empty")
		}
	})

	// 5. List Audios & Verify 4h Episodes (Truy cập công khai - Không cần token khách)
	var targetAudioID float64
	var targetEpisodeID float64
	var user123Token string
	t.Run("List Audios & Inspect Seeded Stories", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/audios", nil)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", w.Code)
		}
		var res response.Envelope
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		audios := res.Data.([]interface{})
		if len(audios) == 0 {
			t.Fatal("Expected seeded audios, got empty")
		}

		firstAudio := audios[0].(map[string]interface{})
		targetAudioID = firstAudio["id"].(float64)
		if firstAudio["formattedDuration"] == "" {
			t.Fatal("Formatted duration is missing")
		}
	})

	// 5b. Verify Audio Pagination and Meta without Loss
	t.Run("Audio Pagination Supports Multi Pages and No Truncation", func(t *testing.T) {
		allReq := httptest.NewRequest(http.MethodGet, "/api/v1/audios?all=true", nil)
		allW := httptest.NewRecorder()
		app.ServeHTTP(allW, allReq)
		if allW.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", allW.Code)
		}
		var allRes response.Envelope
		_ = json.Unmarshal(allW.Body.Bytes(), &allRes)
		allAudios := allRes.Data.([]interface{})
		if len(allAudios) == 0 {
			t.Fatal("Expected audios list")
		}

		pageReq := httptest.NewRequest(http.MethodGet, "/api/v1/audios?page=1&limit=1", nil)
		pageW := httptest.NewRecorder()
		app.ServeHTTP(pageW, pageReq)
		if pageW.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", pageW.Code)
		}
		var pageRes response.Envelope
		_ = json.Unmarshal(pageW.Body.Bytes(), &pageRes)
		meta := pageRes.Meta.(map[string]interface{})
		if meta["total"].(float64) == 0 {
			t.Fatal("Expected meta.total > 0")
		}
		if meta["limit"].(float64) != 1 {
			t.Fatalf("Expected limit 1, got %v", meta["limit"])
		}
	})

	// 6. Get Audio Detail with Episodes & Resume State (Truy cập công khai)
	t.Run("Get Audio Detail with Continuous Episodes", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), nil)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", w.Code)
		}
		var res response.Envelope
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		audioData := res.Data.(map[string]interface{})

		eps := audioData["episodes"].([]interface{})
		if len(eps) == 0 {
			t.Fatal("Expected episodes list, got 0")
		}
		firstEp := eps[0].(map[string]interface{})
		targetEpisodeID = firstEp["id"].(float64)

		if audioData["currentEpisodeNumber"].(float64) != 1 {
			t.Fatalf("Expected resume episode 1, got %v", audioData["currentEpisodeNumber"])
		}
	})

	// 7. Update Progress (Sync 60s & Seek) & Batch Sync (Dành cho tài khoản đã đăng nhập)
	t.Run("Sync Progress & Verify UPSERT", func(t *testing.T) {
		payload := map[string]interface{}{
			"audioId":         targetAudioID,
			"episodeId":       targetEpisodeID,
			"positionSeconds": 3600, // 1 hour into episode
			"progressPercent": 25.0,
			"completed":       false,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/api/v1/progress", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+userToken)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		// Verify that fetching the audio detail now shows resume at 3600 seconds!
		detailReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), nil)
		detailReq.Header.Set("Authorization", "Bearer "+userToken)
		detailW := httptest.NewRecorder()
		app.ServeHTTP(detailW, detailReq)

		var res response.Envelope
		_ = json.Unmarshal(detailW.Body.Bytes(), &res)
		audioData := res.Data.(map[string]interface{})
		if audioData["lastPositionSeconds"].(float64) != 3600 {
			t.Fatalf("Expected resume position 3600, got %v", audioData["lastPositionSeconds"])
		}

		// Test Batch Progress Endpoint (di chuyển session của khách khi login)
		batchPayload := map[string]interface{}{
			"items": []map[string]interface{}{
				{
					"audioId":         targetAudioID,
					"episodeId":       targetEpisodeID,
					"positionSeconds": 5400,
					"progressPercent": 37.5,
					"completed":       false,
				},
			},
		}
		batchBody, _ := json.Marshal(batchPayload)
		batchReq := httptest.NewRequest(http.MethodPut, "/api/v1/progress/batch", bytes.NewReader(batchBody))
		batchReq.Header.Set("Content-Type", "application/json")
		batchReq.Header.Set("Authorization", "Bearer "+userToken)
		batchW := httptest.NewRecorder()
		app.ServeHTTP(batchW, batchReq)
		if batchW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for batch progress, got %d: %s", batchW.Code, batchW.Body.String())
		}
	})

	// 8. Toggle Favorite
	t.Run("Toggle Favorite", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/favorites/%.0f", targetAudioID), nil)
		req.Header.Set("Authorization", "Bearer "+userToken)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var res response.Envelope
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		favData := res.Data.(map[string]interface{})
		if favData["isFavorite"] != true {
			t.Fatalf("Expected isFavorite=true, got %v", favData["isFavorite"])
		}
	})

	// 9. Stats Endpoint
	t.Run("Get System & User Stats", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/stats", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		app.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var res response.Envelope
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		statsData := res.Data.(map[string]interface{})
		if statsData["totalAudios"].(float64) == 0 {
			t.Fatal("Expected totalAudios > 0")
		}
	})

	// 10. Update Audio Permissions (Owner/Admin only)
	t.Run("Update Audio Permissions (Reject Guest, Allow Admin)", func(t *testing.T) {
		updatePayload := map[string]interface{}{
			"title": "Tên Truyện Mới Đã Chỉnh Sửa",
		}
		body, _ := json.Marshal(updatePayload)

		// A. Guest không có token cố tình sửa truyện -> 401 Unauthorized
		guestReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), bytes.NewReader(body))
		guestReq.Header.Set("Content-Type", "application/json")
		guestW := httptest.NewRecorder()
		app.ServeHTTP(guestW, guestReq)

		if guestW.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401 Unauthorized for unauthenticated updating audio, got %d: %s", guestW.Code, guestW.Body.String())
		}

		// B. Admin sửa truyện -> 200 OK
		adminReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), bytes.NewReader(body))
		adminReq.Header.Set("Content-Type", "application/json")
		adminReq.Header.Set("Authorization", "Bearer "+adminToken)
		adminW := httptest.NewRecorder()
		app.ServeHTTP(adminW, adminReq)

		if adminW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for admin updating audio, got %d: %s", adminW.Code, adminW.Body.String())
		}
	})

	// 11. VIP Audio Access Protection
	t.Run("VIP Audio Protection (Reject Guest, Allow VIP/Admin)", func(t *testing.T) {
		// Admin đánh dấu truyện là VIP
		vipPayload := map[string]interface{}{
			"isVipOnly": true,
		}
		body, _ := json.Marshal(vipPayload)
		setVipReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), bytes.NewReader(body))
		setVipReq.Header.Set("Content-Type", "application/json")
		setVipReq.Header.Set("Authorization", "Bearer "+adminToken)
		setVipW := httptest.NewRecorder()
		app.ServeHTTP(setVipW, setVipReq)
		if setVipW.Code != http.StatusOK {
			t.Fatalf("Failed to mark audio as VIP: %d", setVipW.Code)
		}

		// A. Khách (không token) vào truyện VIP -> 200 OK, xem được tập 1 free, tập 2 khóa
		guestReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), nil)
		guestW := httptest.NewRecorder()
		app.ServeHTTP(guestW, guestReq)

		if guestW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for guest accessing VIP audio, got %d: %s", guestW.Code, guestW.Body.String())
		}
		var guestRes response.Envelope
		_ = json.Unmarshal(guestW.Body.Bytes(), &guestRes)
		guestData := guestRes.Data.(map[string]interface{})
		epsList, ok := guestData["episodes"].([]interface{})
		if ok && len(epsList) > 0 {
			ep1 := epsList[0].(map[string]interface{})
			if ep1["isLocked"] == true {
				t.Fatalf("Expected Episode 1 to be free (isLocked: false) for guest, got %+v", ep1)
			}
		}

		// B. Admin truy cập truyện VIP -> 200 OK
		adminReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), nil)
		adminReq.Header.Set("Authorization", "Bearer "+adminToken)
		adminW := httptest.NewRecorder()
		app.ServeHTTP(adminW, adminReq)

		if adminW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for admin accessing VIP audio, got %d: %s", adminW.Code, adminW.Body.String())
		}
	})

	// 12. Test Admin123, Vip123, User123 Login & Email Login (ISSUE 10)
	t.Run("Login with admin123, vip123 and user123", func(t *testing.T) {
		creds := []struct {
			username string
			password string
			role     string
		}{
			{"admin123", "admin123", "ADMIN"},
			{"vip123", "vip123", "VIP"},
			{"user123", "user123", "USER"},
			{"admin123@audioapp.com", "admin123", "ADMIN"}, // Email login
		}

		for _, cred := range creds {
			payload := map[string]string{
				"username": cred.username,
				"password": cred.password,
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			app.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("Expected 200 OK for credential %q, got %d: %s", cred.username, w.Code, w.Body.String())
			}

			var res response.Envelope
			_ = json.Unmarshal(w.Body.Bytes(), &res)
			data := res.Data.(map[string]interface{})
			userMap := data["user"].(map[string]interface{})
			if userMap["role"] != cred.role {
				t.Fatalf("Expected role %s for user %s, got %s", cred.role, cred.username, userMap["role"])
			}
		}
	})

	// 13. Test Toggle Favorite (Add & Remove) (ISSUE 05)
	t.Run("Toggle Favorite (Add then Remove)", func(t *testing.T) {
		// Toggle ON
		reqOn := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/favorites/%.0f/toggle", targetAudioID), nil)
		reqOn.Header.Set("Authorization", "Bearer "+userToken)
		wOn := httptest.NewRecorder()
		app.ServeHTTP(wOn, reqOn)

		if wOn.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK on toggle ON, got %d", wOn.Code)
		}
		var resOn response.Envelope
		_ = json.Unmarshal(wOn.Body.Bytes(), &resOn)
		dataOn := resOn.Data.(map[string]interface{})
		// Note: previously in test 8 we added favorite, so toggle should remove it, or if it was removed toggle adds it
		firstState := dataOn["isFavorite"].(bool)

		// Toggle again -> opposite state
		reqOff := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/favorites/%.0f/toggle", targetAudioID), nil)
		reqOff.Header.Set("Authorization", "Bearer "+userToken)
		wOff := httptest.NewRecorder()
		app.ServeHTTP(wOff, reqOff)

		if wOff.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK on toggle again, got %d", wOff.Code)
		}
		var resOff response.Envelope
		_ = json.Unmarshal(wOff.Body.Bytes(), &resOff)
		dataOff := resOff.Data.(map[string]interface{})
		secondState := dataOff["isFavorite"].(bool)

		if firstState == secondState {
			t.Fatalf("Expected toggle to flip state: first=%v, second=%v", firstState, secondState)
		}
	})

	// 14. Test Consolidated History (No undefined, no duplicates) (ISSUE 04) & Batch History
	t.Run("Consolidated History without undefined or duplicates", func(t *testing.T) {
		// Record history multiple times for the same audio
		for i := 0; i < 3; i++ {
			histPayload := map[string]interface{}{
				"audioId":          targetAudioID,
				"episodeId":        targetEpisodeID,
				"durationListened": 45,
			}
			histBody, _ := json.Marshal(histPayload)
			histReq := httptest.NewRequest(http.MethodPost, "/api/v1/history", bytes.NewReader(histBody))
			histReq.Header.Set("Content-Type", "application/json")
			histReq.Header.Set("Authorization", "Bearer "+userToken)
			histW := httptest.NewRecorder()
			app.ServeHTTP(histW, histReq)
			if histW.Code != http.StatusCreated {
				t.Fatalf("Failed to record history %d: %d", i, histW.Code)
			}
		}

		// Test Batch History Endpoint (di chuyển lịch sử guest khi login)
		batchHistPayload := map[string]interface{}{
			"items": []map[string]interface{}{
				{
					"audioId":          targetAudioID,
					"episodeId":        targetEpisodeID,
					"durationListened": 60,
				},
			},
		}
		batchHistBody, _ := json.Marshal(batchHistPayload)
		batchHistReq := httptest.NewRequest(http.MethodPost, "/api/v1/history/batch", bytes.NewReader(batchHistBody))
		batchHistReq.Header.Set("Content-Type", "application/json")
		batchHistReq.Header.Set("Authorization", "Bearer "+userToken)
		batchHistW := httptest.NewRecorder()
		app.ServeHTTP(batchHistW, batchHistReq)
		if batchHistW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for batch history, got %d: %s", batchHistW.Code, batchHistW.Body.String())
		}

		// Query history
		getHistReq := httptest.NewRequest(http.MethodGet, "/api/v1/history", nil)
		getHistReq.Header.Set("Authorization", "Bearer "+userToken)
		getHistW := httptest.NewRecorder()
		app.ServeHTTP(getHistW, getHistReq)

		if getHistW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for history, got %d", getHistW.Code)
		}

		var res response.Envelope
		_ = json.Unmarshal(getHistW.Body.Bytes(), &res)
		items := res.Data.([]interface{})
		if len(items) == 0 {
			t.Fatal("Expected history items, got 0")
		}

		// Ensure that targetAudioID only appears ONCE
		audioCount := 0
		for _, rawItem := range items {
			item := rawItem.(map[string]interface{})
			if item["audioId"].(float64) == targetAudioID {
				audioCount++
				if item["title"] == nil || item["title"].(string) == "" || item["title"].(string) == "undefined" {
					t.Fatalf("History item has invalid title: %v", item["title"])
				}
				if item["currentEpisodeTitle"] == nil || item["currentEpisodeTitle"].(string) == "" {
					t.Fatalf("History item has invalid currentEpisodeTitle: %v", item["currentEpisodeTitle"])
				}
			}
		}
		if audioCount != 1 {
			t.Fatalf("Expected exactly 1 consolidated history item for audio %.0f, got %d duplicates", targetAudioID, audioCount)
		}
	})

	// 15. Test VIP Membership Order & Simulated QR Payment (ISSUE 13)
	t.Run("Create VIP Order & Simulate Payment", func(t *testing.T) {
		// Login as user123 (Free member)
		userPayload := map[string]string{
			"username": "user123",
			"password": "user123",
		}
		userBody, _ := json.Marshal(userPayload)
		loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(userBody))
		loginReq.Header.Set("Content-Type", "application/json")
		loginW := httptest.NewRecorder()
		app.ServeHTTP(loginW, loginReq)
		if loginW.Code != http.StatusOK {
			t.Fatalf("Login failed for user123: %d", loginW.Code)
		}
		var loginRes response.Envelope
		_ = json.Unmarshal(loginW.Body.Bytes(), &loginRes)
		user123Token = loginRes.Data.(map[string]interface{})["token"].(string)

		// Verify user123 (free user) can access VIP audio (episode 1 is free)
		db.Where("audio_id = ? AND episode_number > 1", targetAudioID).Delete(&domain.Episode{})
		vipAccessReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), nil)
		vipAccessReq.Header.Set("Authorization", "Bearer "+user123Token)
		vipAccessW := httptest.NewRecorder()
		app.ServeHTTP(vipAccessW, vipAccessReq)
		if vipAccessW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for free user accessing VIP audio, got %d", vipAccessW.Code)
		}

		// Create VIP 1 Month Order
		orderPayload := map[string]string{
			"packageId": "1_MONTH",
		}
		orderBody, _ := json.Marshal(orderPayload)
		orderReq := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader(orderBody))
		orderReq.Header.Set("Content-Type", "application/json")
		orderReq.Header.Set("Authorization", "Bearer "+user123Token)
		orderW := httptest.NewRecorder()
		app.ServeHTTP(orderW, orderReq)
		if orderW.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created for VIP order, got %d: %s", orderW.Code, orderW.Body.String())
		}
		var orderRes response.Envelope
		_ = json.Unmarshal(orderW.Body.Bytes(), &orderRes)
		orderData := orderRes.Data.(map[string]interface{})
		orderCode := orderData["orderCode"].(string)
		if orderCode == "" || orderData["qrCodeUrl"] == "" {
			t.Fatalf("Order code or QR URL is missing: %+v", orderData)
		}

		// Simulate Payment SUCCESS
		simPayload := map[string]string{
			"status": "SUCCESS",
		}
		simBody, _ := json.Marshal(simPayload)
		simReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/membership/orders/%s/simulate", orderCode), bytes.NewReader(simBody))
		simReq.Header.Set("Content-Type", "application/json")
		simReq.Header.Set("Authorization", "Bearer "+user123Token)
		simW := httptest.NewRecorder()
		app.ServeHTTP(simW, simReq)
		if simW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK on payment simulation, got %d: %s", simW.Code, simW.Body.String())
		}

		// Verify user123 CAN NOW access the VIP audio!
		vipAccessReq2 := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), nil)
		vipAccessReq2.Header.Set("Authorization", "Bearer "+user123Token)
		vipAccessW2 := httptest.NewRecorder()
		app.ServeHTTP(vipAccessW2, vipAccessReq2)
		if vipAccessW2.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for upgraded VIP user accessing VIP audio, got %d: %s", vipAccessW2.Code, vipAccessW2.Body.String())
		}
	})

	// 16. Test Data Isolation Between User A and User B (ISSUE 07)
	t.Run("Data Isolation Between Separate Identities", func(t *testing.T) {
		// User A (userToken) has progress and history on targetAudioID
		// Log in as a separate user (regular_user)
		userBLoginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader([]byte(`{"username":"regular_user","password":"user123"}`)))
		userBLoginReq.Header.Set("Content-Type", "application/json")
		userBW := httptest.NewRecorder()
		app.ServeHTTP(userBW, userBLoginReq)
		var userBRes response.Envelope
		_ = json.Unmarshal(userBW.Body.Bytes(), &userBRes)
		userBToken := userBRes.Data.(map[string]interface{})["token"].(string)

		// Check User B's history -> Must be empty!
		bHistReq := httptest.NewRequest(http.MethodGet, "/api/v1/history", nil)
		bHistReq.Header.Set("Authorization", "Bearer "+userBToken)
		bHistW := httptest.NewRecorder()
		app.ServeHTTP(bHistW, bHistReq)
		var bHistRes response.Envelope
		_ = json.Unmarshal(bHistW.Body.Bytes(), &bHistRes)
		bItems := bHistRes.Data.([]interface{})
		if len(bItems) != 0 {
			t.Fatalf("Data Leak: User B saw %d history items from another user!", len(bItems))
		}

		// Reset targetAudioID to non-VIP so User B can read details to inspect progress
		resetReq := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), bytes.NewReader([]byte(`{"isVipOnly": false}`)))
		resetReq.Header.Set("Content-Type", "application/json")
		resetReq.Header.Set("Authorization", "Bearer "+adminToken)
		resetW := httptest.NewRecorder()
		app.ServeHTTP(resetW, resetReq)

		// Check User B's progress on targetAudioID -> Must be 0
		bDetailReq := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/audios/%.0f", targetAudioID), nil)
		bDetailReq.Header.Set("Authorization", "Bearer "+userBToken)
		bDetailW := httptest.NewRecorder()
		app.ServeHTTP(bDetailW, bDetailReq)
		var bDetailRes response.Envelope
		_ = json.Unmarshal(bDetailW.Body.Bytes(), &bDetailRes)
		bAudioData, ok := bDetailRes.Data.(map[string]interface{})
		if !ok || bAudioData == nil {
			t.Fatalf("Expected audio detail data for User B, got status %d: %s", bDetailW.Code, bDetailW.Body.String())
		}
		if bAudioData["lastPositionSeconds"].(float64) != 0 {
			t.Fatalf("Data Leak: User B saw lastPositionSeconds %v from user A!", bAudioData["lastPositionSeconds"])
		}
	})

	// 17. Test Admin VIP Settings & Package Tier Locking
	t.Run("Admin VIP Management & Package Tier Locking", func(t *testing.T) {
		// A. Admin updates payment info
		newPayment := map[string]string{
			"bankName":      "Vietcombank (Ngoại Thương)",
			"accountNumber": "1234567899",
			"accountName":   "TRAN DUC ANH",
			"notePrefix":    "WAVELINK",
		}
		body, _ := json.Marshal(newPayment)
		updatePayReq := httptest.NewRequest(http.MethodPut, "/api/v1/membership/admin/payment-info", bytes.NewReader(body))
		updatePayReq.Header.Set("Content-Type", "application/json")
		updatePayReq.Header.Set("Authorization", "Bearer "+adminToken)
		updatePayW := httptest.NewRecorder()
		app.ServeHTTP(updatePayW, updatePayReq)
		if updatePayW.Code != http.StatusOK {
			t.Fatalf("Failed to update payment info: %d %s", updatePayW.Code, updatePayW.Body.String())
		}

		// B. Get payment info publicly
		getPayReq := httptest.NewRequest(http.MethodGet, "/api/v1/membership/payment-info", nil)
		getPayW := httptest.NewRecorder()
		app.ServeHTTP(getPayW, getPayReq)
		if getPayW.Code != http.StatusOK {
			t.Fatalf("Failed to get payment info: %d", getPayW.Code)
		}
		var payRes response.Envelope
		_ = json.Unmarshal(getPayW.Body.Bytes(), &payRes)
		payData := payRes.Data.(map[string]interface{})
		if payData["bankName"] != "Vietcombank (Ngoại Thương)" || payData["accountNumber"] != "1234567899" {
			t.Fatalf("Payment info mismatch: %+v", payData)
		}

		// C. User123 (already upgraded to 1 Month VIP earlier in test) tries to buy 1 Month package again -> 400 Bad Request
		rebuyReq := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader([]byte(`{"packageId":"VIP_1M"}`)))
		rebuyReq.Header.Set("Content-Type", "application/json")
		rebuyReq.Header.Set("Authorization", "Bearer "+user123Token)
		rebuyW := httptest.NewRecorder()
		app.ServeHTTP(rebuyW, rebuyReq)
		if rebuyW.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request when rebuying locked lower/same tier package, got %d", rebuyW.Code)
		}

		// D. User123 upgrades to 3 Months package -> 201 Created & duration accumulates
		upgradeReq := httptest.NewRequest(http.MethodPost, "/api/v1/membership/orders", bytes.NewReader([]byte(`{"packageId":"VIP_3M"}`)))
		upgradeReq.Header.Set("Content-Type", "application/json")
		upgradeReq.Header.Set("Authorization", "Bearer "+user123Token)
		upgradeW := httptest.NewRecorder()
		app.ServeHTTP(upgradeW, upgradeReq)
		if upgradeW.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created for upgrading to 3M VIP, got %d: %s", upgradeW.Code, upgradeW.Body.String())
		}
		var upRes response.Envelope
		_ = json.Unmarshal(upgradeW.Body.Bytes(), &upRes)
		upOrderData := upRes.Data.(map[string]interface{})
		upOrderCode := upOrderData["orderCode"].(string)

		// Simulate payment SUCCESS for 3M upgrade
		simBody, _ := json.Marshal(map[string]string{"status": "SUCCESS"})
		simReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/membership/orders/%s/simulate", upOrderCode), bytes.NewReader(simBody))
		simReq.Header.Set("Content-Type", "application/json")
		simReq.Header.Set("Authorization", "Bearer "+user123Token)
		simW := httptest.NewRecorder()
		app.ServeHTTP(simW, simReq)
		if simW.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK on upgrade simulation, got %d", simW.Code)
		}

		// Verify User123's packages endpoint now marks VIP_1M and VIP_3M as locked, and VIP_1Y as canUpgrade
		pkgReq := httptest.NewRequest(http.MethodGet, "/api/v1/membership/packages", nil)
		pkgReq.Header.Set("Authorization", "Bearer "+user123Token)
		pkgW := httptest.NewRecorder()
		app.ServeHTTP(pkgW, pkgReq)
		if pkgW.Code != http.StatusOK {
			t.Fatalf("Failed to fetch packages for user123: %d", pkgW.Code)
		}
		var pkgRes response.Envelope
		_ = json.Unmarshal(pkgW.Body.Bytes(), &pkgRes)
		pkgList := pkgRes.Data.([]interface{})
		for _, item := range pkgList {
			p := item.(map[string]interface{})
			if p["id"] == "VIP_1M" || p["id"] == "VIP_3M" {
				if p["isLocked"] != true {
					t.Fatalf("Expected %s to be locked for user123, got: %+v", p["id"], p)
				}
			}
			if p["id"] == "VIP_1Y" {
				if p["canUpgrade"] != true {
					t.Fatalf("Expected VIP_1Y to be available for upgrade, got: %+v", p)
				}
			}
		}
	})
}
