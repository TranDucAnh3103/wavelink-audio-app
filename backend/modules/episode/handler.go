package episode

import (
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
	AudioID      uint   `json:"audioId" binding:"required"`
	Title        string `json:"title" binding:"required"`
	StartSeconds int    `json:"startSeconds"`
	EndSeconds   int    `json:"endSeconds" binding:"required"`
}

type UpdateEpisodeRequest struct {
	Title        string `json:"title"`
	StartSeconds *int   `json:"startSeconds"`
	EndSeconds   *int   `json:"endSeconds"`
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	// Nested routes under /audios (dùng :id đồng nhất với Gin radix tree)
	rg.GET("/audios/:id/episodes", h.GetEpisodesByAudioID)
	rg.POST("/audios/:id/episodes/generate", middleware.RequireAuth(), h.GenerateEpisodes)

	// Top level episode routes
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

	isVipOrAdmin := logic.IsActiveVIPOrAdmin(currentUser)
	for i := range episodes {
		if audio.IsVIPOnly {
			episodes[i].IsVIP = true
		}
		if audio.IsVIPOnly || episodes[i].IsVIP {
			if !isVipOrAdmin {
				if episodes[i].EpisodeNumber > freeLimit || freeLimit == 0 {
					episodes[i].IsLocked = true
				} else {
					episodes[i].IsLocked = false
				}
			} else {
				episodes[i].IsLocked = false
			}
		} else {
			episodes[i].IsLocked = false
		}
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

	blockSize := 14400 // 4h
	if req.BlockSizeSeconds > 0 {
		blockSize = req.BlockSizeSeconds
	}

	// Bảo toàn ID tập và tiến trình người dùng: Cập nhật in-place thay vì xóa sạch (tránh ON DELETE CASCADE)
	epDrafts := logic.ComputeLogicalEpisodes(audio.ID, duration, blockSize)
	var newEpisodes []domain.Episode

	err := h.db.Transaction(func(tx *gorm.DB) error {
		var existingEps []domain.Episode
		if err := tx.Where("audio_id = ?", audio.ID).Order("episode_number ASC").Find(&existingEps).Error; err != nil {
			return err
		}

		for i, draft := range epDrafts {
			if i < len(existingEps) {
				// Cập nhật in-place tập đã tồn tại, giữ nguyên ID để không mất ListeningProgress
				existing := existingEps[i]
				existing.Title = draft.Title
				existing.StartSeconds = draft.StartSeconds
				existing.EndSeconds = draft.EndSeconds
				existing.DurationSeconds = draft.DurationSeconds
				if err := tx.Save(&existing).Error; err != nil {
					return err
				}
				newEpisodes = append(newEpisodes, existing)
			} else {
				// Tạo thêm tập mới nếu chia thành nhiều tập hơn
				ep := domain.Episode{
					AudioID:         audio.ID,
					EpisodeNumber:   draft.EpisodeNumber,
					Title:           draft.Title,
					StartSeconds:    draft.StartSeconds,
					EndSeconds:      draft.EndSeconds,
					DurationSeconds: draft.DurationSeconds,
				}
				if err := tx.Create(&ep).Error; err != nil {
					return err
				}
				newEpisodes = append(newEpisodes, ep)
			}
		}

		// Nếu số lượng tập mới ít hơn số lượng tập cũ, xóa các tập thừa ở cuối
		if len(existingEps) > len(epDrafts) {
			for j := len(epDrafts); j < len(existingEps); j++ {
				_ = tx.Delete(&domain.Episode{}, existingEps[j].ID)
			}
		}

		return nil
	})

	if err != nil {
		response.Internal(c, "Lỗi sinh tập logic: "+err.Error())
		return
	}

	response.OK(c, newEpisodes, nil)
}

func (h *Handler) CreateEpisode(c *gin.Context) {
	var req CreateEpisodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu tập không hợp lệ")
		return
	}

	var maxEp domain.Episode
	h.db.Where("audio_id = ?", req.AudioID).Order("episode_number DESC").First(&maxEp)
	nextNum := maxEp.EpisodeNumber + 1

	dur := req.EndSeconds - req.StartSeconds
	if dur <= 0 {
		dur = 14400
	}

	ep := domain.Episode{
		AudioID:         req.AudioID,
		EpisodeNumber:   nextNum,
		Title:           req.Title,
		StartSeconds:    req.StartSeconds,
		EndSeconds:      req.EndSeconds,
		DurationSeconds: dur,
	}

	if err := h.db.Create(&ep).Error; err != nil {
		response.Internal(c, "Không thể tạo tập mới")
		return
	}

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

	updates := map[string]interface{}{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	nextStart := existing.StartSeconds
	nextEnd := existing.EndSeconds
	if req.StartSeconds != nil && *req.StartSeconds >= 0 {
		nextStart = *req.StartSeconds
		updates["start_seconds"] = nextStart
	}
	if req.EndSeconds != nil && *req.EndSeconds > nextStart {
		nextEnd = *req.EndSeconds
		updates["end_seconds"] = nextEnd
	}
	if (req.StartSeconds != nil || req.EndSeconds != nil) && nextEnd > nextStart {
		updates["duration_seconds"] = nextEnd - nextStart
	}

	if err := h.db.Model(&domain.Episode{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		response.Internal(c, "Không thể cập nhật tập")
		return
	}

	var ep domain.Episode
	h.db.First(&ep, id)
	response.OK(c, ep, nil)
}

func (h *Handler) DeleteEpisode(c *gin.Context) {
	id := c.Param("id")
	if err := h.db.Delete(&domain.Episode{}, id).Error; err != nil {
		response.Internal(c, "Không thể xóa tập")
		return
	}
	response.OK(c, gin.H{"message": "Đã xóa tập thành công"}, nil)
}
