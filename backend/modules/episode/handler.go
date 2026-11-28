package episode

import (
	"fmt"
	"sort"

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

type GenerateEpisodesRequest struct {
	BlockSizeSeconds int `json:"blockSizeSeconds"`
	DurationSeconds  int `json:"durationSeconds"`
}

type CreateEpisodeRequest struct {
	AudioID       uint   `json:"audioId" binding:"required"`
	EpisodeNumber *int   `json:"episodeNumber"`
	Title         string `json:"title" binding:"required"`
	StartSeconds  int    `json:"startSeconds"`
	EndSeconds    int    `json:"endSeconds" binding:"required"`
	IsVIP         *bool  `json:"isVip"`
}

type UpdateEpisodeRequest struct {
	Title         string `json:"title"`
	EpisodeNumber *int   `json:"episodeNumber"`
	StartSeconds  *int   `json:"startSeconds"`
	EndSeconds    *int   `json:"endSeconds"`
	IsVIP         *bool  `json:"isVip"`
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/audios/:id/episodes", h.GetEpisodesByAudioID)
	rg.POST("/audios/:id/episodes/generate", middleware.RequireAuth(), h.GenerateEpisodes)

	episodes := rg.Group("/episodes")
	episodes.Use(middleware.RequireAuth(), middleware.RequireAdmin())
	{
		episodes.POST("", h.CreateEpisode)
		episodes.PUT("/:id", h.UpdateEpisode)
		episodes.DELETE("/:id", h.DeleteEpisode)
	}
}

func (h *Handler) GetEpisodesByAudioID(c *gin.Context) {
	audioID := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	var audio domain.Audio
	_ = h.db.First(&audio, audioID)

	var episodes []domain.Episode
	if err := h.db.Where("audio_id = ?", audioID).Order("episode_number ASC").Find(&episodes).Error; err != nil {
		response.Internal(c, "Lỗi lấy danh sách tập")
		return
	}

	var currentUser domain.User
	if userID > 0 {
		h.db.First(&currentUser, userID)
		var progresses []domain.ListeningProgress
		h.db.Where("user_id = ? AND audio_id = ?", userID, audioID).Find(&progresses)
		progMap := map[uint]domain.ListeningProgress{}
		for _, p := range progresses {
			progMap[p.EpisodeID] = p
		}
		for i := range episodes {
			if p, ok := progMap[episodes[i].ID]; ok {
				episodes[i].Completed = p.Completed
				episodes[i].ProgressPercent = p.ProgressPercent
				episodes[i].PositionSeconds = p.PositionSeconds
			}
		}
	} else {
		currentUser = domain.User{Role: domain.RoleGuest, IsGuest: true, Membership: domain.MembershipFree}
	}

	freeLimit := 1
	if audio.FreeEpisodesCount != nil {
		freeLimit = *audio.FreeEpisodesCount
	}

	for i := range episodes {
		if audio.IsVIPOnly && (freeLimit == 0 || episodes[i].EpisodeNumber > freeLimit) {
			episodes[i].IsVIP = true
		}
		canAccess, _ := logic.CanAccessEpisode(currentUser, audio, episodes[i])
		episodes[i].IsLocked = !canAccess
	}

	response.OK(c, episodes, nil)
}

func (h *Handler) GenerateEpisodes(c *gin.Context) {
	audioID := c.Param("id")
	var req GenerateEpisodesRequest
	_ = c.ShouldBindJSON(&req)

	var audio domain.Audio
	if err := h.db.First(&audio, audioID).Error; err != nil {
		response.NotFound(c, "Không tìm thấy Audio")
		return
	}

	currentUserID := middleware.GetCurrentUserID(c)
	currentUserRole := middleware.GetCurrentUserRole(c)
	if currentUserRole != domain.RoleAdmin && audio.CreatedBy != currentUserID {
		response.Forbidden(c, "Bạn không có quyền phân tập lại cho audio này")
		return
	}

	duration := audio.TotalDurationSeconds
	if req.DurationSeconds > 0 {
		duration = req.DurationSeconds
		h.db.Model(&audio).Update("duration_seconds", duration)
	}

	blockSize := 14400
	if req.BlockSizeSeconds > 0 {
		blockSize = req.BlockSizeSeconds
	}

	freeLimit := 1
	if audio.FreeEpisodesCount != nil {
		freeLimit = *audio.FreeEpisodesCount
	}

	epDrafts := logic.ComputeLogicalEpisodes(audio.ID, duration, blockSize)
	var newEpisodes []domain.Episode

	err := h.db.Transaction(func(tx *gorm.DB) error {
		var existingEps []domain.Episode
		if err := tx.Where("audio_id = ?", audio.ID).Order("episode_number ASC").Find(&existingEps).Error; err != nil {
			return err
		}

		for i, draft := range epDrafts {
			isVIP := audio.IsVIPOnly && (freeLimit == 0 || draft.EpisodeNumber > freeLimit)
			if i < len(existingEps) {
				existing := existingEps[i]
				existing.EpisodeNumber = draft.EpisodeNumber
				existing.Title = draft.Title
				existing.StartSeconds = draft.StartSeconds
				existing.EndSeconds = draft.EndSeconds
				existing.DurationSeconds = draft.DurationSeconds
				existing.IsVIP = isVIP
				if err := tx.Save(&existing).Error; err != nil {
					return err
				}
				newEpisodes = append(newEpisodes, existing)
			} else {
				ep := domain.Episode{
					AudioID:         audio.ID,
					EpisodeNumber:   draft.EpisodeNumber,
					Title:           draft.Title,
					StartSeconds:    draft.StartSeconds,
					EndSeconds:      draft.EndSeconds,
					DurationSeconds: draft.DurationSeconds,
					IsVIP:           isVIP,
				}
				if err := tx.Create(&ep).Error; err != nil {
					return err
				}
				newEpisodes = append(newEpisodes, ep)
			}
		}

		if len(existingEps) > len(epDrafts) {
			for j := len(epDrafts); j < len(existingEps); j++ {
				_ = tx.Where("episode_id = ?", existingEps[j].ID).Delete(&domain.ListeningProgress{})
				_ = tx.Delete(&domain.Episode{}, existingEps[j].ID)
			}
		}

		return nil
	})

	if err != nil {
		response.Internal(c, "Lỗi sinh tập logic: "+err.Error())
		return
	}

	middleware.RecordAudit(h.db, c, "episodes_generate", "audio", fmt.Sprint(audio.ID), audio.Title, fmt.Sprintf("%d tập", len(newEpisodes)))
	response.OK(c, newEpisodes, nil)
}

func checkOverlap(eps []domain.Episode, skipID uint, start, end int) (bool, string) {
	for _, e := range eps {
		if skipID > 0 && e.ID == skipID {
			continue
		}
		if start < e.EndSeconds && end > e.StartSeconds {
			return true, fmt.Sprintf("Khoảng thời gian bị trùng với Tập %d (%s)", e.EpisodeNumber, e.Title)
		}
	}
	return false, ""
}

func (h *Handler) CreateEpisode(c *gin.Context) {
	var req CreateEpisodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu tập không hợp lệ")
		return
	}
	if req.StartSeconds < 0 || req.EndSeconds <= req.StartSeconds {
		response.BadRequest(c, "Thời gian kết thúc phải lớn hơn thời gian bắt đầu")
		return
	}

	var audio domain.Audio
	if err := h.db.First(&audio, req.AudioID).Error; err != nil {
		response.NotFound(c, "Không tìm thấy Audio")
		return
	}
	if audio.TotalDurationSeconds > 0 && req.EndSeconds > audio.TotalDurationSeconds {
		response.BadRequest(c, fmt.Sprintf("Thời điểm kết thúc (%ds) vượt quá tổng thời lượng audio (%ds)", req.EndSeconds, audio.TotalDurationSeconds))
		return
	}

	var existing []domain.Episode
	h.db.Where("audio_id = ?", req.AudioID).Order("episode_number ASC").Find(&existing)
	if overlap, msg := checkOverlap(existing, 0, req.StartSeconds, req.EndSeconds); overlap {
		response.BadRequest(c, msg)
		return
	}

	nextNum := len(existing) + 1
	if req.EpisodeNumber != nil && *req.EpisodeNumber >= 1 && *req.EpisodeNumber <= len(existing)+1 {
		nextNum = *req.EpisodeNumber
	}

	isVIP := false
	if req.IsVIP != nil {
		isVIP = *req.IsVIP
	} else if audio.IsVIPOnly {
		freeLimit := 1
		if audio.FreeEpisodesCount != nil {
			freeLimit = *audio.FreeEpisodesCount
		}
		isVIP = freeLimit == 0 || nextNum > freeLimit
	}

	dur := req.EndSeconds - req.StartSeconds
	ep := domain.Episode{
		AudioID:         req.AudioID,
		EpisodeNumber:   nextNum,
		Title:           req.Title,
		StartSeconds:    req.StartSeconds,
		EndSeconds:      req.EndSeconds,
		DurationSeconds: dur,
		IsVIP:           isVIP,
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		// Đẩy lùi số thứ tự nếu chèn vào giữa (tránh vi phạm unique uk_audio_ep)
		if nextNum <= len(existing) {
			for i := len(existing) - 1; i >= 0; i-- {
				if existing[i].EpisodeNumber >= nextNum {
					if err := tx.Model(&domain.Episode{}).Where("id = ?", existing[i].ID).
						Update("episode_number", existing[i].EpisodeNumber+1).Error; err != nil {
						return err
					}
				}
			}
		}
		return tx.Create(&ep).Error
	})
	if err != nil {
		response.Internal(c, "Không thể tạo tập mới")
		return
	}

	middleware.RecordAudit(h.db, c, "episode_create", "episode", fmt.Sprint(ep.ID), ep.Title, fmt.Sprintf("audio=%d", ep.AudioID))
	response.Created(c, ep)
}

func (h *Handler) UpdateEpisode(c *gin.Context) {
	id := c.Param("id")
	var req UpdateEpisodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu không hợp lệ")
		return
	}

	var existing domain.Episode
	if err := h.db.First(&existing, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy tập")
		return
	}

	var audio domain.Audio
	_ = h.db.First(&audio, existing.AudioID)

	nextStart := existing.StartSeconds
	nextEnd := existing.EndSeconds
	if req.StartSeconds != nil {
		if *req.StartSeconds < 0 {
			response.BadRequest(c, "Thời gian bắt đầu không được âm")
			return
		}
		nextStart = *req.StartSeconds
	}
	if req.EndSeconds != nil {
		nextEnd = *req.EndSeconds
	}
	if nextEnd <= nextStart {
		response.BadRequest(c, "Thời gian kết thúc phải lớn hơn thời gian bắt đầu")
		return
	}
	if audio.TotalDurationSeconds > 0 && nextEnd > audio.TotalDurationSeconds {
		response.BadRequest(c, fmt.Sprintf("Thời điểm kết thúc (%ds) vượt quá tổng thời lượng audio (%ds)", nextEnd, audio.TotalDurationSeconds))
		return
	}

	var siblings []domain.Episode
	h.db.Where("audio_id = ?", existing.AudioID).Order("episode_number ASC").Find(&siblings)
	if overlap, msg := checkOverlap(siblings, existing.ID, nextStart, nextEnd); overlap {
		response.BadRequest(c, msg)
		return
	}

	updates := map[string]interface{}{
		"start_seconds":    nextStart,
		"end_seconds":      nextEnd,
		"duration_seconds": nextEnd - nextStart,
	}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.IsVIP != nil {
		updates["is_vip"] = *req.IsVIP
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&domain.Episode{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		if req.EpisodeNumber != nil && *req.EpisodeNumber >= 1 && *req.EpisodeNumber != existing.EpisodeNumber {
			targetNum := *req.EpisodeNumber
			if targetNum > len(siblings) {
				targetNum = len(siblings)
			}
			// Đánh số tạm âm rồi xếp lại liên tục để không đụng unique index uk_audio_ep
			ordered := make([]domain.Episode, 0, len(siblings))
			for _, s := range siblings {
				if s.ID != existing.ID {
					ordered = append(ordered, s)
				}
			}
			sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].EpisodeNumber < ordered[j].EpisodeNumber })
			idx := targetNum - 1
			ordered = append(ordered[:idx], append([]domain.Episode{existing}, ordered[idx:]...)...)
			for i, item := range ordered {
				if err := tx.Model(&domain.Episode{}).Where("id = ?", item.ID).Update("episode_number", -(i + 1)).Error; err != nil {
					return err
				}
			}
			for i, item := range ordered {
				if err := tx.Model(&domain.Episode{}).Where("id = ?", item.ID).Update("episode_number", i+1).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		response.Internal(c, "Không thể cập nhật tập")
		return
	}

	var ep domain.Episode
	h.db.First(&ep, id)
	middleware.RecordAudit(h.db, c, "episode_update", "episode", id, ep.Title, fmt.Sprintf("audio=%d", ep.AudioID))
	response.OK(c, ep, nil)
}

func (h *Handler) DeleteEpisode(c *gin.Context) {
	id := c.Param("id")
	var ep domain.Episode
	if err := h.db.First(&ep, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy tập")
		return
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		_ = tx.Where("episode_id = ?", ep.ID).Delete(&domain.ListeningProgress{}).Error
		_ = tx.Where("episode_id = ?", ep.ID).Delete(&domain.ListeningHistory{}).Error
		if err := tx.Delete(&domain.Episode{}, ep.ID).Error; err != nil {
			return err
		}
		// Đánh số lại các tập còn lại liên tục 1..N
		var remaining []domain.Episode
		if err := tx.Where("audio_id = ?", ep.AudioID).Order("episode_number ASC").Find(&remaining).Error; err != nil {
			return err
		}
		for i, item := range remaining {
			if item.EpisodeNumber != i+1 {
				if err := tx.Model(&domain.Episode{}).Where("id = ?", item.ID).Update("episode_number", i+1).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		response.Internal(c, "Không thể xóa tập")
		return
	}
	middleware.RecordAudit(h.db, c, "episode_delete", "episode", fmt.Sprint(ep.ID), ep.Title, fmt.Sprintf("audio=%d", ep.AudioID))
	response.OK(c, gin.H{"message": "Đã xóa tập thành công"}, nil)
}
