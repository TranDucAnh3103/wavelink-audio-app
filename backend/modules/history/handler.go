package history

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/core/logic"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	db *gorm.DB
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{db: db}
}

type RecordHistoryRequest struct {
	AudioID          uint `json:"audioId" binding:"required"`
	EpisodeID        uint `json:"episodeId" binding:"required"`
	DurationListened int  `json:"durationListened" binding:"required"`
}

type BatchHistoryRequest struct {
	Items []RecordHistoryRequest `json:"items" binding:"required"`
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/history", middleware.RequireAuth(), h.GetRecentHistory)
	rg.POST("/history", middleware.RequireAuth(), h.RecordHistory)
	rg.POST("/history/batch", middleware.RequireAuth(), h.BatchRecordHistory)
}

func (h *Handler) GetRecentHistory(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)

	// 1. Gom nhóm theo audio_id trên toàn bộ nhật ký nghe (tránh Limit trên bảng thô làm rớt truyện cũ)
	type histAgg struct {
		AudioID uint `gorm:"column:audio_id"`
		MaxID   uint `gorm:"column:max_id"`
		Total   int  `gorm:"column:total"`
	}
	var aggs []histAgg
	if err := h.db.Model(&domain.ListeningHistory{}).
		Select("audio_id, MAX(id) as max_id, SUM(duration_listened) as total").
		Where("user_id = ? AND audio_id > 0", userID).
		Group("audio_id").
		Scan(&aggs).Error; err != nil {
		response.Internal(c, "Lỗi truy vấn lịch sử nghe")
		return
	}

	durMap := make(map[uint]int, len(aggs))
	maxIDs := make([]uint, 0, len(aggs))
	for _, a := range aggs {
		durMap[a.AudioID] = a.Total
		if a.MaxID > 0 {
			maxIDs = append(maxIDs, a.MaxID)
		}
	}

	histTimeByAudio := make(map[uint]time.Time, len(aggs))
	if len(maxIDs) > 0 {
		var latestHistRows []domain.ListeningHistory
		if err := h.db.Where("id IN ?", maxIDs).Find(&latestHistRows).Error; err == nil {
			for _, rec := range latestHistRows {
				if rec.CreatedAt.After(histTimeByAudio[rec.AudioID]) {
					histTimeByAudio[rec.AudioID] = rec.CreatedAt
				}
			}
		}
	}

	// 2. Lấy toàn bộ tiến trình nghe của user để gộp cả audio mới bắt đầu nghe (<10s hoặc mới có progress)
	var progs []domain.ListeningProgress
	if err := h.db.Where("user_id = ? AND audio_id > 0", userID).
		Order("updated_at DESC").
		Find(&progs).Error; err != nil {
		response.Internal(c, "Lỗi truy vấn tiến trình nghe")
		return
	}

	progByAudio := make(map[uint]domain.ListeningProgress)
	for _, p := range progs {
		if _, exists := progByAudio[p.AudioID]; !exists {
			progByAudio[p.AudioID] = p
		}
	}

	lastActivityAt := make(map[uint]time.Time)
	for aID, t := range histTimeByAudio {
		lastActivityAt[aID] = t
	}
	for aID, p := range progByAudio {
		if existing, exists := lastActivityAt[aID]; !exists || p.UpdatedAt.After(existing) {
			lastActivityAt[aID] = p.UpdatedAt
		}
	}

	if len(lastActivityAt) == 0 {
		response.OK(c, []domain.ConsolidatedHistoryItem{}, nil)
		return
	}

	uniqueAudioIDs := make([]uint, 0, len(lastActivityAt))
	for aID := range lastActivityAt {
		uniqueAudioIDs = append(uniqueAudioIDs, aID)
	}
	sort.Slice(uniqueAudioIDs, func(i, j int) bool {
		ti := lastActivityAt[uniqueAudioIDs[i]]
		tj := lastActivityAt[uniqueAudioIDs[j]]
		if ti.Equal(tj) {
			return uniqueAudioIDs[i] > uniqueAudioIDs[j]
		}
		return ti.After(tj)
	})

	totalCount := len(uniqueAudioIDs)
	pageStr := strings.TrimSpace(c.Query("page"))
	limitStr := strings.TrimSpace(c.Query("limit"))
	isAll := c.Query("all") == "true" || limitStr == "all" || limitStr == "0" || limitStr == "-1"

	page := 1
	if p, err := strconv.Atoi(pageStr); err == nil && p >= 1 {
		page = p
	}
	limit := 0
	hasPagination := false
	if !isAll && limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
			if limit > 500 {
				limit = 500
			}
			hasPagination = true
		}
	} else if !isAll && pageStr != "" {
		limit = 12
		hasPagination = true
	}

	pageAudioIDs := uniqueAudioIDs
	if hasPagination {
		start := (page - 1) * limit
		if start >= totalCount {
			pageAudioIDs = nil
		} else {
			end := start + limit
			if end > totalCount {
				end = totalCount
			}
			pageAudioIDs = uniqueAudioIDs[start:end]
		}
	}

	effLimit := limit
	if effLimit <= 0 {
		effLimit = totalCount
		if effLimit <= 0 {
			effLimit = 1
		}
	}
	totalPages := int(math.Ceil(float64(totalCount) / float64(effLimit)))
	if totalPages < 1 {
		totalPages = 1
	}

	meta := gin.H{
		"total":      totalCount,
		"page":       page,
		"limit":      effLimit,
		"totalPages": totalPages,
	}

	if len(pageAudioIDs) == 0 {
		response.OK(c, []domain.ConsolidatedHistoryItem{}, meta)
		return
	}

	// Lấy thông tin Audio gọn (bỏ description) & chỉ tải đúng episode đang nghe + tổng số tập
	var audios []domain.Audio
	h.db.Omit("description").Where("id IN ?", pageAudioIDs).Find(&audios)
	audioMap := make(map[uint]domain.Audio, len(audios))
	for _, a := range audios {
		audioMap[a.ID] = a
	}

	type histEpCount struct {
		AudioID uint `gorm:"column:audio_id"`
		Total   int  `gorm:"column:total"`
	}
	var epCounts []histEpCount
	h.db.Model(&domain.Episode{}).
		Select("audio_id, COUNT(*) as total").
		Where("audio_id IN ?", pageAudioIDs).
		Group("audio_id").
		Scan(&epCounts)
	epCountMap := make(map[uint]int, len(epCounts))
	for _, ec := range epCounts {
		epCountMap[ec.AudioID] = ec.Total
	}

	neededEpIDs := make([]uint, 0, len(pageAudioIDs))
	for _, aID := range pageAudioIDs {
		if p, ok := progByAudio[aID]; ok && p.EpisodeID > 0 {
			neededEpIDs = append(neededEpIDs, p.EpisodeID)
		}
	}
	var episodes []domain.Episode
	if len(neededEpIDs) > 0 {
		h.db.Where("id IN ? OR (audio_id IN ? AND episode_number = 1)", neededEpIDs, pageAudioIDs).Find(&episodes)
	} else {
		h.db.Where("audio_id IN ? AND episode_number = 1", pageAudioIDs).Find(&episodes)
	}
	epByID := make(map[uint]domain.Episode, len(episodes))
	epFirstByAudio := make(map[uint]domain.Episode, len(pageAudioIDs))
	for _, ep := range episodes {
		epByID[ep.ID] = ep
		if ep.EpisodeNumber == 1 {
			epFirstByAudio[ep.AudioID] = ep
		}
	}

	consolidated := make([]domain.ConsolidatedHistoryItem, 0, len(pageAudioIDs))
	for _, aID := range pageAudioIDs {
		audio, exists := audioMap[aID]
		if !exists {
			continue
		}

		prog := progByAudio[aID]
		epTitle := "Tập 1"
		epNum := 1
		startSec := 0
		if ep, ok := epByID[prog.EpisodeID]; ok {
			epTitle = ep.Title
			epNum = ep.EpisodeNumber
			startSec = ep.StartSeconds
		} else if firstEp, ok := epFirstByAudio[aID]; ok {
			epTitle = firstEp.Title
			epNum = firstEp.EpisodeNumber
			startSec = firstEp.StartSeconds
		}

		// Tính thời gian đã nghe tích luỹ qua các tập:
		// Ví dụ Tập 1 (4h) + Tập 2 (thời lượng nghe tập 2) -> cho đến Tập N+1
		accumulatedDuration := startSec + prog.PositionSeconds
		if accumulatedDuration <= 0 && durMap[aID] > 0 {
			accumulatedDuration = durMap[aID]
		}

		lastTime := lastActivityAt[aID]
		if lastTime.IsZero() {
			lastTime = time.Now().UTC()
		}

		totalEps := epCountMap[audio.ID]
		if totalEps <= 0 {
			totalEps = 1
		}

		item := domain.ConsolidatedHistoryItem{
			AudioID:               audio.ID,
			Title:                 audio.Title,
			Author:                audio.Author,
			ThumbnailURL:          audio.ThumbnailURL,
			TotalEpisodes:         totalEps,
			CurrentEpisodeID:      prog.EpisodeID,
			CurrentEpisodeNumber:  epNum,
			CurrentEpisodeTitle:   epTitle,
			LastPositionSeconds:   prog.PositionSeconds,
			DurationSeconds:       prog.DurationSeconds,
			ProgressPercent:       prog.ProgressPercent,
			FormattedPosition:     logic.FormatTime(prog.PositionSeconds),
			TotalDurationListened: accumulatedDuration,
			LastListenedAt:        lastTime,
		}
		consolidated = append(consolidated, item)
	}

	response.OK(c, consolidated, meta)
}

func (h *Handler) RecordHistory(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	var req RecordHistoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu lịch sử không hợp lệ")
		return
	}

	// Chỉ lưu nhật ký nếu nghe >= 10 giây; chặn giá trị ảo vượt quá 4 giờ/lần gửi
	if req.DurationListened < 10 {
		response.OK(c, gin.H{"recorded": false, "reason": "duration < 10s"}, nil)
		return
	}
	duration := req.DurationListened
	if duration > 14400 {
		duration = 14400
	}

	hist := domain.ListeningHistory{
		UserID:           userID,
		AudioID:          req.AudioID,
		EpisodeID:        req.EpisodeID,
		DurationListened: duration,
		StartedAt:        time.Now().UTC().Add(-time.Duration(duration) * time.Second),
		CreatedAt:        time.Now().UTC(),
	}

	if err := h.db.Create(&hist).Error; err != nil {
		response.Internal(c, "Lỗi ghi nhật ký lịch sử")
		return
	}

	response.Created(c, hist)
}

func (h *Handler) BatchRecordHistory(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	var req BatchHistoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu lịch sử không hợp lệ: "+err.Error())
		return
	}

	if len(req.Items) == 0 {
		response.OK(c, gin.H{"count": 0}, nil)
		return
	}

	now := time.Now().UTC()
	var records []domain.ListeningHistory
	for _, item := range req.Items {
		if item.DurationListened < 10 {
			continue
		}
		dur := item.DurationListened
		if dur > 14400 {
			dur = 14400
		}
		records = append(records, domain.ListeningHistory{
			UserID:           userID,
			AudioID:          item.AudioID,
			EpisodeID:        item.EpisodeID,
			DurationListened: dur,
			StartedAt:        now.Add(-time.Duration(dur) * time.Second),
			CreatedAt:        now,
		})
	}

	if len(records) > 0 {
		if err := h.db.Create(&records).Error; err != nil {
			response.Internal(c, "Lỗi lưu lịch sử hàng loạt: "+err.Error())
			return
		}
	}

	response.OK(c, gin.H{"count": len(records)}, nil)
}
