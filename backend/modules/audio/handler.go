package audio

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/core/logic"
	"audio-app-backend/infra/external"
	"audio-app-backend/modules/notification"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"gorm.io/gorm"
)

type Handler struct {
	db *gorm.DB
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{db: db}
}

type ImportYouTubeRequest struct {
	URL               string   `json:"url" binding:"required"`
	CategoryID        uint     `json:"categoryId"`
	Tags              []string `json:"tags"`
	DurationSeconds   int      `json:"durationSeconds"`
	BlockSizeSeconds  int      `json:"blockSizeSeconds"`
	IsVIPOnly         bool     `json:"isVipOnly"`
	FreeEpisodesCount *int     `json:"freeEpisodesCount"`
}

type UpdateAudioRequest struct {
	Title             string   `json:"title"`
	Author            string   `json:"author"`
	Description       string   `json:"description"`
	CategoryID        uint     `json:"categoryId"`
	Tags              []string `json:"tags"`
	Status            string   `json:"status"`
	IsVIPOnly         *bool    `json:"isVipOnly"`
	FreeEpisodesCount *int     `json:"freeEpisodesCount"`
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	audios := rg.Group("/audios")
	{
		audios.GET("", h.ListAudios)
		audios.GET("/quota", h.GetImportQuota)
		audios.GET("/preview-youtube", h.PreviewYouTube)
		audios.POST("/preview-youtube", h.PreviewYouTube)
		audios.GET("/:id", h.GetAudioByID)
		audios.POST("/import-youtube", middleware.RequireAuth(), h.ImportYouTube)
		audios.PUT("/:id", middleware.RequireAuth(), h.UpdateAudio)
		audios.DELETE("/:id", middleware.RequireAuth(), middleware.RequireAdmin(), h.DeleteAudio)
		audios.POST("/:id/refresh", middleware.RequireAuth(), h.RefreshAudio)
	}
}

func (h *Handler) ListAudios(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	search := strings.TrimSpace(c.Query("search"))
	catIDStr := c.Query("categoryId")
	tag := strings.TrimSpace(c.Query("tag"))
	status := strings.TrimSpace(c.Query("status")) // "listening", "completed", "favorite", "my"
	sortBy := strings.TrimSpace(c.Query("sort"))   // "popular", "latest", etc.

	// Phân trang chuẩn hóa (Pagination)
	pageStr := strings.TrimSpace(c.Query("page"))
	limitStr := strings.TrimSpace(c.Query("limit"))
	isAll := c.Query("all") == "true" || limitStr == "all" || limitStr == "0" || limitStr == "-1"

	page := 1
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p >= 1 {
			page = p
		}
	}

	limit := 0
	hasPagination := false
	if !isAll && limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
			if limit > 10000 {
				limit = 10000
			}
			hasPagination = true
		}
	} else if !isAll && pageStr != "" {
		// Có chỉ định page cụ thể nhưng không có limit -> mặc định 12 phần tử/trang
		limit = 12
		hasPagination = true
	}

	query := h.db.Model(&domain.Audio{}).Preload("Category").Preload("Tags")

	if search != "" {
		likePattern := "%" + search + "%"
		query = query.Where("youtube_videos.title LIKE ? OR youtube_videos.author_name LIKE ? OR youtube_videos.youtube_video_id LIKE ?", likePattern, likePattern, likePattern)
	}

	if catIDStr != "" {
		if catID, err := strconv.ParseUint(catIDStr, 10, 32); err == nil && catID > 0 {
			query = query.Where("youtube_videos.category_id = ?", catID)
		}
	}

	if tag != "" {
		query = query.Joins("JOIN audio_tags ON audio_tags.audio_id = youtube_videos.id").
			Joins("JOIN tags ON tags.id = audio_tags.tag_id").
			Where("tags.name = ? OR tags.slug = ?", tag, tag)
	}

	// Lọc trạng thái tại tầng SQL (Triệt tiêu việc duyệt vòng lặp trên RAM và chống nhân bản bản ghi)
	if status == "favorite" && userID > 0 {
		query = query.Where("youtube_videos.id IN (SELECT DISTINCT audio_id FROM favorites WHERE user_id = ?)", userID)
	} else if status == "listening" && userID > 0 {
		query = query.Where("youtube_videos.id IN (SELECT DISTINCT audio_id FROM listening_progress WHERE user_id = ? AND progress_percent > 0 AND (progress_percent < 95 OR completed = 0))", userID)
	} else if status == "completed" && userID > 0 {
		query = query.Where("youtube_videos.id IN (SELECT DISTINCT audio_id FROM listening_progress WHERE user_id = ? AND (progress_percent >= 95 OR completed = 1))", userID)
	}

	// Lọc theo người tải lên cụ thể (Hỗ trợ URL /library?userId=123 hoặc status=user_123)
	filterUserIDStr := strings.TrimSpace(c.Query("userId"))
	if filterUserIDStr == "" {
		filterUserIDStr = strings.TrimSpace(c.Query("createdBy"))
	}
	if strings.HasPrefix(status, "user_") {
		filterUserIDStr = strings.TrimPrefix(status, "user_")
	}

	if filterUserIDStr != "" {
		if targetUID, err := strconv.ParseUint(filterUserIDStr, 10, 32); err == nil && targetUID > 0 {
			query = query.Where("youtube_videos.created_by = ?", targetUID)
		}
	} else if (status == "my" || c.Query("my") == "true") && userID > 0 {
		query = query.Where("youtube_videos.created_by = ?", userID)
	}

	// Đếm tổng số bản ghi phù hợp
	var totalCount int64
	if err := query.Count(&totalCount).Error; err != nil {
		response.Internal(c, "Lỗi đếm số lượng Audio: "+err.Error())
		return
	}

	var audios []domain.Audio
	if sortBy == "popular" {
		query = query.Select("youtube_videos.*").
			Joins("LEFT JOIN (SELECT audio_id, COUNT(DISTINCT user_id) as v_cnt FROM listening_progress WHERE progress_percent >= 15.0 GROUP BY audio_id) vp ON vp.audio_id = youtube_videos.id").
			Order("COALESCE(vp.v_cnt, 0) DESC, youtube_videos.created_at DESC")
	} else {
		query = query.Order("youtube_videos.created_at DESC")
	}

	if hasPagination {
		offset := (page - 1) * limit
		query = query.Offset(offset).Limit(limit)
	}

	if err := query.Find(&audios).Error; err != nil {
		response.Internal(c, "Lỗi truy vấn danh sách Audio: "+err.Error())
		return
	}

	effLimit := limit
	if effLimit <= 0 {
		effLimit = int(totalCount)
		if effLimit <= 0 {
			effLimit = 1
		}
	}
	totalPages := int(math.Ceil(float64(totalCount) / float64(effLimit)))
	if totalPages < 1 {
		totalPages = 1
	}

	if len(audios) == 0 {
		response.OK(c, []domain.Audio{}, gin.H{
			"total":      totalCount,
			"page":       page,
			"limit":      effLimit,
			"totalPages": totalPages,
		})
		return
	}

	audioIDs := lo.Map(audios, func(a domain.Audio, _ int) uint { return a.ID })

	// Tối ưu N+1: Lấy danh sách episodes theo batch
	var allEpisodes []domain.Episode
	h.db.Where("audio_id IN ?", audioIDs).Order("episode_number ASC").Find(&allEpisodes)
	episodesByAudio := lo.GroupBy(allEpisodes, func(ep domain.Episode) uint { return ep.AudioID })

	// Tối ưu N+1: Lấy danh sách favorites theo batch
	favMap := make(map[uint]bool)
	if userID > 0 {
		var favs []domain.Favorite
		h.db.Where("user_id = ? AND audio_id IN ?", userID, audioIDs).Find(&favs)
		for _, f := range favs {
			favMap[f.AudioID] = true
		}
	}

	// Tối ưu N+1: Lấy tiến trình nghe theo batch
	var progs []domain.ListeningProgress
	if userID > 0 {
		h.db.Where("user_id = ? AND audio_id IN ?", userID, audioIDs).
			Order("updated_at DESC").
			Find(&progs)
	}
	progressByAudio := lo.GroupBy(progs, func(p domain.ListeningProgress) uint { return p.AudioID })

	// Lấy số lượt xem (View Count): 1 user nghe >= 15% của 1 tập = 1 view duy nhất cho audio, không cộng dồn của 1 user
	type AudioViewStat struct {
		AudioID uint  `gorm:"column:audio_id"`
		Views   int64 `gorm:"column:views"`
	}
	var viewStats []AudioViewStat
	if len(audioIDs) > 0 {
		h.db.Model(&domain.ListeningProgress{}).
			Select("audio_id, COUNT(DISTINCT user_id) as views").
			Where("audio_id IN ? AND progress_percent >= 15.0", audioIDs).
			Group("audio_id").
			Scan(&viewStats)
	}
	viewMap := make(map[uint]int64, len(viewStats))
	for _, vs := range viewStats {
		viewMap[vs.AudioID] = vs.Views
	}

	// Enrich dữ liệu sạch sẽ, chuẩn xác cho cả UI trang chủ, thư viện và player
	result := make([]domain.Audio, 0, len(audios))
	for _, a := range audios {
		a.ViewCount = viewMap[a.ID]
		a.TagNames = lo.Map(a.Tags, func(t domain.Tag, _ int) string { return t.Name })
		if a.Category != nil {
			a.CategoryName = a.Category.Name
		}
		a.FormattedDuration = logic.FormatDuration(a.TotalDurationSeconds)
		a.IsFavorite = favMap[a.ID]

		epsForAudio := episodesByAudio[a.ID]
		progsForAudio := progressByAudio[a.ID]
		progressByEp := lo.KeyBy(progsForAudio, func(p domain.ListeningProgress) uint { return p.EpisodeID })

		// Gắn tiến trình chi tiết vào từng episode
		for i := range epsForAudio {
			if p, found := progressByEp[epsForAudio[i].ID]; found {
				epsForAudio[i].Completed = p.Completed
				epsForAudio[i].ProgressPercent = p.ProgressPercent
				epsForAudio[i].PositionSeconds = p.PositionSeconds
			}
		}
		a.Episodes = epsForAudio
		a.TotalEpisodes = len(epsForAudio)

		// Tính Resume State chuẩn xác theo UpdatedAt mới nhất
		resume := logic.CalculateResumeState(a, epsForAudio, progsForAudio)
		a.LastPositionSeconds = resume.LastPositionSeconds
		a.ProgressPercent = resume.ProgressPercent
		a.FormattedPosition = resume.FormattedPosition
		a.CurrentEpisodeID = resume.CurrentEpisodeID
		a.CurrentEpisodeNumber = resume.CurrentEpisodeNumber
		a.CurrentEpisodeTitle = resume.CurrentEpisodeTitle

		result = append(result, a)
	}

	response.OK(c, result, gin.H{
		"total":      totalCount,
		"page":       page,
		"limit":      effLimit,
		"totalPages": totalPages,
	})
}

func (h *Handler) GetAudioByID(c *gin.Context) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)

	var audio domain.Audio
	if err := h.db.Preload("Category").Preload("Tags").First(&audio, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy Audio")
		return
	}

	// 1. Kiểm soát quyền truy cập nội dung VIP (VIP Access Check)
	var currentUser domain.User
	if userID > 0 {
		h.db.First(&currentUser, userID)
	} else {
		currentUser = domain.User{Role: domain.RoleGuest, IsGuest: true, Membership: domain.MembershipFree}
	}

	// Lấy danh sách episodes
	var episodes []domain.Episode
	h.db.Where("audio_id = ?", audio.ID).Order("episode_number ASC").Find(&episodes)
	audio.TotalEpisodes = len(episodes)
	audio.Episodes = episodes

	if can, msg := logic.CanAccessAudio(currentUser, audio); !can {
		response.Forbidden(c, msg)
		return
	}

	// Lấy danh sách progress của user cho các episodes này
	var progresses []domain.ListeningProgress
	if userID > 0 {
		h.db.Where("user_id = ? AND audio_id = ?", userID, audio.ID).Find(&progresses)
	}
	progressByEp := lo.KeyBy(progresses, func(p domain.ListeningProgress) uint {
		return p.EpisodeID
	})

	// Gắn progress và trạng thái VIP/Khóa vào từng episode
	isVipOrAdmin := currentUser.Role == domain.RoleAdmin || currentUser.Role == domain.RoleVIP || currentUser.Membership == domain.MembershipVIP
	for i := range episodes {
		if p, found := progressByEp[episodes[i].ID]; found {
			episodes[i].Completed = p.Completed
			episodes[i].ProgressPercent = p.ProgressPercent
			episodes[i].PositionSeconds = p.PositionSeconds
		}
		if audio.IsVIPOnly {
			episodes[i].IsVIP = true
		}
		// Khóa logic: tập 1 luôn mở cho tất cả mọi người; nếu là truyện VIP/tập VIP thì khóa từ tập 2 trở đi đối với người dùng không phải VIP/Admin
		if audio.IsVIPOnly || episodes[i].IsVIP {
			if !isVipOrAdmin {
				if episodes[i].EpisodeNumber > 1 {
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
	audio.Episodes = episodes
	audio.TotalEpisodes = len(episodes)
	audio.TagNames = lo.Map(audio.Tags, func(t domain.Tag, _ int) string { return t.Name })
	if audio.Category != nil {
		audio.CategoryName = audio.Category.Name
	}
	audio.FormattedDuration = logic.FormatDuration(audio.TotalDurationSeconds)

	// Kiểm tra Favorite
	if userID > 0 {
		var favCount int64
		h.db.Model(&domain.Favorite{}).Where("user_id = ? AND audio_id = ?", userID, audio.ID).Count(&favCount)
		audio.IsFavorite = favCount > 0
	}

	// Tính Resume State chuẩn xác bằng Pure Function
	resume := logic.CalculateResumeState(audio, episodes, progresses)
	audio.LastPositionSeconds = resume.LastPositionSeconds
	audio.ProgressPercent = resume.ProgressPercent
	audio.FormattedPosition = resume.FormattedPosition
	audio.CurrentEpisodeID = resume.CurrentEpisodeID
	audio.CurrentEpisodeNumber = resume.CurrentEpisodeNumber
	// Lấy số lượt xem (View Count): 1 user nghe >= 15% của 1 tập = 1 view duy nhất, không cộng dồn của 1 user
	var viewCount int64
	h.db.Model(&domain.ListeningProgress{}).
		Where("audio_id = ? AND progress_percent >= 15.0", audio.ID).
		Distinct("user_id").
		Count(&viewCount)
	audio.ViewCount = viewCount

	response.OK(c, audio, nil)
}

func (h *Handler) GetImportQuota(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	if userID == 0 {
		response.OK(c, gin.H{
			"isGuest":          true,
			"isVipOrAdmin":     false,
			"todayImportCount": 0,
			"maxImportsPerDay": logic.MaxFreeImportsPerDay,
			"remaining":        0,
			"canImport":        false,
			"reason":           "Khách vãng lai không thể nhập link. Vui lòng đăng nhập hoặc nâng cấp tài khoản.",
		}, nil)
		return
	}

	var currentUser domain.User
	if err := h.db.First(&currentUser, userID).Error; err != nil {
		response.NotFound(c, "Người dùng không tồn tại")
		return
	}

	isVipOrAdmin := currentUser.Role == domain.RoleAdmin || currentUser.Role == domain.RoleVIP || currentUser.Membership == domain.MembershipVIP

	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	var todayCount int64
	h.db.Model(&domain.Audio{}).
		Where("created_by = ? AND created_at >= ?", currentUser.ID, startOfDay).
		Count(&todayCount)

	canImport, reason := logic.CanImportYouTube(currentUser, int(todayCount))

	remaining := logic.MaxFreeImportsPerDay - int(todayCount)
	if remaining < 0 {
		remaining = 0
	}
	if isVipOrAdmin {
		remaining = 999999
	}

	response.OK(c, gin.H{
		"isGuest":          false,
		"isVipOrAdmin":     isVipOrAdmin,
		"todayImportCount": todayCount,
		"maxImportsPerDay": logic.MaxFreeImportsPerDay,
		"remaining":        remaining,
		"canImport":        canImport,
		"reason":           reason,
	}, nil)
}

func (h *Handler) ImportYouTube(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	var currentUser domain.User
	h.db.First(&currentUser, userID)

	// 1. Kiểm tra chính sách hạn mức ngày theo user_id và mốc 00:00 của ngày hôm nay
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var todayCount int64
	h.db.Model(&domain.Audio{}).
		Where("created_by = ? AND created_at >= ?", currentUser.ID, startOfDay).
		Count(&todayCount)

	if can, msg := logic.CanImportYouTube(currentUser, int(todayCount)); !can {
		response.Forbidden(c, msg)
		return
	}

	var req ImportYouTubeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "URL YouTube không được để trống")
		return
	}

	// 2. Pure Regex bóc tách Video ID
	videoIDRes := logic.ExtractYouTubeVideoID(req.URL)
	if videoIDRes.IsError() {
		response.BadRequest(c, videoIDRes.Error().Error())
		return
	}
	videoID := videoIDRes.MustGet()

	// 3. Kiểm tra trùng lặp
	var existing domain.Audio
	if err := h.db.Preload("Category").Preload("Tags").Preload("Episodes").Where("youtube_video_id = ?", videoID).First(&existing).Error; err == nil {
		existing.TotalEpisodes = len(existing.Episodes)
		existing.FormattedDuration = logic.FormatDuration(existing.TotalDurationSeconds)
		existing.TagNames = lo.Map(existing.Tags, func(t domain.Tag, _ int) string { return t.Name })
		if existing.Category != nil {
			existing.CategoryName = existing.Category.Name
		}
		response.OK(c, gin.H{
			"duplicate": true,
			"message":   "Video này đã tồn tại trong thư viện",
			"audio":     existing,
		}, nil)
		return
	}

	// 4. Lấy Metadata từ YouTube (Innertube / oEmbed)
	meta, err := external.FetchYouTubeMetadata(videoID)
	if err != nil {
		response.BadRequest(c, "Video YouTube không tồn tại, ở chế độ riêng tư hoặc không thể phát")
		return
	}

	// 5. Suy luận thời lượng (Duration Inference)
	duration := external.InferDurationFromMetadata(meta, req.DurationSeconds)
	if duration <= 0 {
		duration = req.BlockSizeSeconds
		if duration <= 0 {
			duration = 3600 // Mặc định 1 giờ an toàn thay vì 16 giờ
		}
	}

	// 6. Transactional Persistence (GORM Atomic Transaction)
	var newAudio domain.Audio
	err = h.db.Transaction(func(tx *gorm.DB) error {
		freeCount := 1
		if req.FreeEpisodesCount != nil {
			freeCount = *req.FreeEpisodesCount
			if freeCount < 0 {
				freeCount = 0
			}
		}

		newAudio = domain.Audio{
			YoutubeVideoID:       videoID,
			YoutubeURL:           fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID),
			Title:                meta.Title,
			Author:               meta.Author,
			Description:          meta.Description,
			ThumbnailURL:         meta.ThumbnailURL,
			TotalDurationSeconds: duration,
			CategoryID:           req.CategoryID,
			Status:               domain.StatusActive,
			IsVIPOnly:            req.IsVIPOnly,
			FreeEpisodesCount:    &freeCount,
			CreatedBy:            currentUser.ID, // Ghi nhận ID người nhập
		}

		if err := tx.Create(&newAudio).Error; err != nil {
			return err
		}

		// Chia các tập logic dựa trên thiết lập của người dùng (2h, 4h, v.v.)
		blockSize := req.BlockSizeSeconds
		if blockSize <= 0 {
			blockSize = 14400 // Mặc định 4h nếu không truyền
		}
		epDrafts := logic.ComputeLogicalEpisodes(newAudio.ID, duration, blockSize)
		for _, draft := range epDrafts {
			isVIP := req.IsVIPOnly && (draft.EpisodeNumber > freeCount || freeCount == 0)
			ep := domain.Episode{
				AudioID:         newAudio.ID,
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
		}

		// Gắn tags tương thích chuẩn GORM Association (Hoàn toàn không dùng raw SQL INSERT OR IGNORE)
		var tagsToAdd []domain.Tag
		for _, tagName := range req.Tags {
			tagName = strings.TrimSpace(tagName)
			if tagName == "" {
				continue
			}
			var tag domain.Tag
			slug := strings.ToLower(strings.ReplaceAll(tagName, " ", "-"))
			tx.Where(domain.Tag{Name: tagName}).Attrs(domain.Tag{Slug: slug}).FirstOrCreate(&tag)
			tagsToAdd = append(tagsToAdd, tag)
		}

		if len(tagsToAdd) > 0 {
			if err := tx.Model(&newAudio).Association("Tags").Append(tagsToAdd); err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		response.Internal(c, "Lỗi lưu trữ Audio: "+err.Error())
		return
	}

	// Trả về Audio hoàn chỉnh
	h.db.Preload("Category").Preload("Tags").Preload("Episodes").First(&newAudio, newAudio.ID)
	newAudio.TotalEpisodes = len(newAudio.Episodes)
	newAudio.FormattedDuration = logic.FormatDuration(newAudio.TotalDurationSeconds)

	// Gửi thông báo an toàn về audio mới vào Notification Center (tự lọc trùng và kiểm tra cài đặt)
	newNotif := domain.Notification{
		UserID:    currentUser.ID,
		Title:     "Audio mới sẵn sàng: " + newAudio.Title,
		Message:   fmt.Sprintf("Audio '%s' (%s, %d tập) đã được xử lý và thêm vào danh mục.", newAudio.Title, newAudio.FormattedDuration, newAudio.TotalEpisodes),
		Type:      "NEW_EPISODE",
		Link:      fmt.Sprintf("#/player?audioId=%d", newAudio.ID),
		IsRead:    false,
		CreatedAt: time.Now().UTC(),
	}
	notification.CreateSafeNotification(h.db, newNotif)

	response.Created(c, gin.H{
		"audio":     newAudio,
		"duplicate": false,
	})
}

func (h *Handler) UpdateAudio(c *gin.Context) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)
	userRole := middleware.GetCurrentUserRole(c)

	var audio domain.Audio
	if err := h.db.First(&audio, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy Audio")
		return
	}

	// Phân quyền chặt chẽ: Phải là ADMIN hoặc chính người tạo Audio (Owner)
	if userRole != domain.RoleAdmin && (audio.CreatedBy == 0 || audio.CreatedBy != userID) {
		response.Forbidden(c, "Bạn không có quyền chỉnh sửa Audio này")
		return
	}

	var req UpdateAudioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu không hợp lệ")
		return
	}

	updates := map[string]interface{}{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Author != "" {
		updates["author_name"] = req.Author
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.CategoryID > 0 {
		updates["category_id"] = req.CategoryID
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}
	if req.IsVIPOnly != nil {
		updates["is_vip_only"] = *req.IsVIPOnly
	}
	if req.FreeEpisodesCount != nil {
		updates["free_episodes_count"] = *req.FreeEpisodesCount
	}

	// Đồng bộ trạng thái VIP và số tập miễn phí của các tập
	if req.IsVIPOnly != nil || req.FreeEpisodesCount != nil {
		vipOnly := audio.IsVIPOnly
		if req.IsVIPOnly != nil {
			vipOnly = *req.IsVIPOnly
		}
		freeLimit := 1
		if audio.FreeEpisodesCount != nil {
			freeLimit = *audio.FreeEpisodesCount
		}
		if req.FreeEpisodesCount != nil {
			freeLimit = *req.FreeEpisodesCount
		}
		if !vipOnly {
			_ = h.db.Model(&domain.Episode{}).Where("audio_id = ?", audio.ID).Update("is_vip", false)
		} else {
			if freeLimit <= 0 {
				_ = h.db.Model(&domain.Episode{}).Where("audio_id = ?", audio.ID).Update("is_vip", true)
			} else {
				_ = h.db.Model(&domain.Episode{}).Where("audio_id = ? AND episode_number <= ?", audio.ID, freeLimit).Update("is_vip", false)
				_ = h.db.Model(&domain.Episode{}).Where("audio_id = ? AND episode_number > ?", audio.ID, freeLimit).Update("is_vip", true)
			}
		}
	}

	if len(updates) > 0 {
		if err := h.db.Model(&audio).Updates(updates).Error; err != nil {
			response.Internal(c, "Không thể cập nhật Audio")
			return
		}
	}

	// Cập nhật Tags nếu có truyền req.Tags
	if req.Tags != nil {
		var tagsToAdd []domain.Tag
		for _, tagName := range req.Tags {
			tagName = strings.TrimSpace(tagName)
			if tagName == "" {
				continue
			}
			var tag domain.Tag
			slug := strings.ToLower(strings.ReplaceAll(tagName, " ", "-"))
			h.db.Where(domain.Tag{Name: tagName}).Attrs(domain.Tag{Slug: slug}).FirstOrCreate(&tag)
			tagsToAdd = append(tagsToAdd, tag)
		}
		_ = h.db.Model(&audio).Association("Tags").Replace(tagsToAdd)
	}

	h.db.Preload("Category").Preload("Tags").First(&audio, id)
	response.OK(c, audio, nil)
}

func (h *Handler) DeleteAudio(c *gin.Context) {
	id := c.Param("id")
	userID := middleware.GetCurrentUserID(c)
	userRole := middleware.GetCurrentUserRole(c)

	var audio domain.Audio
	if err := h.db.First(&audio, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy Audio")
		return
	}

	// Phân quyền chặt chẽ: Phải là ADMIN hoặc chính người tạo Audio (Owner)
	if userRole != domain.RoleAdmin && (audio.CreatedBy == 0 || audio.CreatedBy != userID) {
		response.Forbidden(c, "Bạn không có quyền xóa Audio này")
		return
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		// 1. Xóa các quan hệ many-to-many trong bảng audio_tags
		if err := tx.Exec("DELETE FROM audio_tags WHERE audio_id = ?", audio.ID).Error; err != nil {
			return fmt.Errorf("lỗi xóa quan hệ thẻ (audio_tags): %w", err)
		}

		// 2. Xóa tiến độ nghe (listening_progress) liên quan
		if err := tx.Exec("DELETE FROM listening_progress WHERE audio_id = ?", audio.ID).Error; err != nil {
			return fmt.Errorf("lỗi xóa tiến độ nghe: %w", err)
		}

		// 3. Xóa lịch sử nghe (listening_history) liên quan
		if err := tx.Exec("DELETE FROM listening_history WHERE audio_id = ?", audio.ID).Error; err != nil {
			return fmt.Errorf("lỗi xóa lịch sử nghe: %w", err)
		}

		// 4. Xóa yêu thích (favorites) liên quan
		if err := tx.Exec("DELETE FROM favorites WHERE audio_id = ?", audio.ID).Error; err != nil {
			return fmt.Errorf("lỗi xóa yêu thích: %w", err)
		}

		// 5. Xóa các tập logic (episodes) liên quan
		if err := tx.Exec("DELETE FROM episodes WHERE audio_id = ?", audio.ID).Error; err != nil {
			return fmt.Errorf("lỗi xóa danh sách tập: %w", err)
		}

		// 6. Xóa bản ghi audio chính trong bảng youtube_videos
		if err := tx.Delete(&audio).Error; err != nil {
			return fmt.Errorf("lỗi xóa bản ghi audio: %w", err)
		}

		return nil
	})

	if err != nil {
		response.Internal(c, "Không thể xóa Audio: "+err.Error())
		return
	}
	response.OK(c, gin.H{"message": "Đã xóa Audio thành công"}, nil)
}

func (h *Handler) RefreshAudio(c *gin.Context) {
	id := c.Param("id")
	var audio domain.Audio
	if err := h.db.First(&audio, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy Audio")
		return
	}

	meta, err := external.FetchYouTubeMetadata(audio.YoutubeVideoID)
	if err == nil {
		h.db.Model(&audio).Updates(map[string]interface{}{
			"title":         meta.Title,
			"author_name":   meta.Author,
			"thumbnail_url": meta.ThumbnailURL,
		})
	}

	h.db.Preload("Category").Preload("Tags").First(&audio, id)
	response.OK(c, audio, nil)
}

func (h *Handler) PreviewYouTube(c *gin.Context) {
	url := c.Query("url")
	if url == "" {
		var req struct {
			URL string `json:"url"`
		}
		if err := c.ShouldBindJSON(&req); err == nil {
			url = req.URL
		}
	}

	videoIDRes := logic.ExtractYouTubeVideoID(url)
	if videoIDRes.IsError() {
		response.BadRequest(c, videoIDRes.Error().Error())
		return
	}
	videoID := videoIDRes.MustGet()

	meta, err := external.FetchYouTubeMetadata(videoID)
	if err != nil {
		response.BadRequest(c, "Video YouTube không tồn tại, ở chế độ riêng tư hoặc không thể phát")
		return
	}

	response.OK(c, meta, nil)
}
