package admin

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/core/logic"
	"audio-app-backend/infra/external"
	"audio-app-backend/modules/notification"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var vnLoc = time.FixedZone("Asia/Ho_Chi_Minh", 7*3600)

func startOfVNDayUTC(t time.Time) time.Time {
	vn := t.In(vnLoc)
	return time.Date(vn.Year(), vn.Month(), vn.Day(), 0, 0, 0, 0, vnLoc).UTC()
}

type audioRow struct {
	domain.Audio
	CreatorUsername string `json:"creatorUsername"`
}

func applyAudioFilter(tx *gorm.DB, status, stream, access, tag string, categoryID, createdBy uint) *gorm.DB {
	switch strings.ToUpper(status) {
	case "ACTIVE":
		tx = tx.Where("status = ? OR status = '' OR status IS NULL", domain.StatusActive)
	case "HIDDEN":
		tx = tx.Where("status = ?", domain.StatusHidden)
	}
	switch strings.ToUpper(stream) {
	case "OK", "FAILED":
		tx = tx.Where("stream_status = ?", strings.ToUpper(stream))
	case "UNKNOWN":
		tx = tx.Where("stream_status = ? OR stream_status = '' OR stream_status IS NULL", domain.StreamStatusUnknown)
	}
	switch access {
	case "vip":
		tx = tx.Where("is_vip_only = ?", true)
	case "free":
		tx = tx.Where("is_vip_only = ? OR is_vip_only IS NULL", false)
	}
	if categoryID > 0 {
		tx = tx.Where("category_id = ?", categoryID)
	}
	if createdBy > 0 {
		tx = tx.Where("created_by = ?", createdBy)
	}
	if t := strings.TrimSpace(tag); t != "" {
		tx = tx.Where("id IN (SELECT audio_id FROM audio_tags WHERE tag_id IN (SELECT id FROM tags WHERE LOWER(slug) = ? OR LOWER(name) = ?))",
			strings.ToLower(t), strings.ToLower(t))
	}
	return tx
}

func (h *Handler) ListAudios(c *gin.Context) {
	page, size := pageParams(c)
	q := strings.TrimSpace(c.Query("q"))
	tag := strings.TrimSpace(c.Query("tag"))
	source := strings.ToLower(strings.TrimSpace(c.Query("source")))

	var categoryID, createdBy uint
	if v, err := strconv.ParseUint(strings.TrimSpace(c.Query("categoryId")), 10, 32); err == nil {
		categoryID = uint(v)
	}
	if v, err := strconv.ParseUint(strings.TrimSpace(c.Query("createdBy")), 10, 32); err == nil {
		createdBy = uint(v)
	}

	base := func() *gorm.DB { return h.db.Model(&domain.Audio{}) }
	tx := applyAudioFilter(base(), c.Query("status"), c.Query("stream"), c.Query("access"), tag, categoryID, createdBy)
	switch source {
	case "admin":
		tx = tx.Where("created_by = 0 OR created_by IN (SELECT id FROM users WHERE role = ?)", domain.RoleAdmin)
	case "user":
		tx = tx.Where("created_by > 0 AND created_by NOT IN (SELECT id FROM users WHERE role = ?)", domain.RoleAdmin)
	}
	if q != "" {
		tx = tx.Where("LOWER(title) LIKE ? OR LOWER(author_name) LIKE ? OR LOWER(youtube_video_id) LIKE ?", like(q), like(q), like(q))
	}

	var total int64
	tx.Session(&gorm.Session{}).Count(&total)

	order := "created_at DESC"
	switch c.Query("sort") {
	case "oldest":
		order = "created_at ASC"
	case "title":
		order = "title ASC"
	}

	var audios []domain.Audio
	if err := tx.Preload("Category").Preload("Tags").Order(order).Offset((page - 1) * size).Limit(size).Find(&audios).Error; err != nil {
		response.Internal(c, "Không thể tải danh sách audio")
		return
	}

	ids := make([]uint, 0, len(audios))
	creatorSet := map[uint]bool{}
	creatorIDs := make([]uint, 0)
	for _, a := range audios {
		ids = append(ids, a.ID)
		if a.CreatedBy > 0 && !creatorSet[a.CreatedBy] {
			creatorSet[a.CreatedBy] = true
			creatorIDs = append(creatorIDs, a.CreatedBy)
		}
	}

	eps := map[uint]int{}
	plays := map[uint]int64{}
	creators := map[uint]string{}
	if len(ids) > 0 {
		var er []struct {
			AudioID uint
			N       int
		}
		h.db.Model(&domain.Episode{}).Select("audio_id, COUNT(*) AS n").Where("audio_id IN ?", ids).Group("audio_id").Scan(&er)
		for _, r := range er {
			eps[r.AudioID] = r.N
		}
		var pr []struct {
			AudioID uint
			N       int64
		}
		h.db.Model(&domain.ListeningHistory{}).Select("audio_id, COUNT(*) AS n").Where("audio_id IN ?", ids).Group("audio_id").Scan(&pr)
		for _, r := range pr {
			plays[r.AudioID] = r.N
		}
	}
	if len(creatorIDs) > 0 {
		var us []domain.User
		h.db.Select("id, username").Where("id IN ?", creatorIDs).Find(&us)
		for _, u := range us {
			creators[u.ID] = u.Username
		}
	}

	items := make([]audioRow, 0, len(audios))
	for i := range audios {
		a := audios[i]
		a.TotalEpisodes = eps[a.ID]
		a.ViewCount = plays[a.ID]
		if a.Category != nil {
			a.CategoryName = a.Category.Name
		}
		a.FormattedDuration = formatDur(a.TotalDurationSeconds)
		a.TagNames = make([]string, 0, len(a.Tags))
		for _, t := range a.Tags {
			a.TagNames = append(a.TagNames, t.Name)
		}
		if a.Status == "" {
			a.Status = domain.StatusActive
		}
		cname := "Hệ thống"
		if a.CreatedBy > 0 {
			if n := creators[a.CreatedBy]; n != "" {
				cname = n
			} else {
				cname = fmt.Sprintf("User #%d", a.CreatedBy)
			}
		}
		items = append(items, audioRow{Audio: a, CreatorUsername: cname})
	}

	counts := map[string]int64{}
	count := func(key string, t *gorm.DB) {
		var n int64
		t.Count(&n)
		counts[key] = n
	}
	count("all", base())
	count("active", applyAudioFilter(base(), "ACTIVE", "", "", "", 0, 0))
	count("hidden", applyAudioFilter(base(), "HIDDEN", "", "", "", 0, 0))
	count("vip", applyAudioFilter(base(), "", "", "vip", "", 0, 0))
	count("failed", applyAudioFilter(base(), "", "FAILED", "", "", 0, 0))
	count("user", base().Where("created_by > 0 AND created_by NOT IN (SELECT id FROM users WHERE role = ?)", domain.RoleAdmin))

	response.OK(c, gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": size,
		"counts":   counts,
	}, nil)
}

func formatDur(sec int) string {
	h := sec / 3600
	m := (sec % 3600) / 60
	if h > 0 {
		return strings.TrimSpace(strings.Join([]string{itoa(h) + "h", pad2(m) + "m"}, " "))
	}
	return itoa(m) + "m"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}

func pad2(n int) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

func (h *Handler) BulkAudios(c *gin.Context) {
	var req struct {
		IDs        []uint `json:"ids"`
		Action     string `json:"action"` // hide | show | vip | free | delete | set_category | add_tag
		CategoryID uint   `json:"categoryId"`
		Tag        string `json:"tag"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		response.BadRequest(c, "Chưa chọn audio nào")
		return
	}
	if len(req.IDs) > 200 {
		response.BadRequest(c, "Tối đa 200 audio mỗi lần")
		return
	}

	switch req.Action {
	case "hide", "show", "vip", "free", "set_category":
		var updates map[string]interface{}
		switch req.Action {
		case "hide":
			updates = map[string]interface{}{"status": domain.StatusHidden}
		case "show":
			updates = map[string]interface{}{"status": domain.StatusActive}
		case "vip":
			updates = map[string]interface{}{"is_vip_only": true}
		case "free":
			updates = map[string]interface{}{"is_vip_only": false}
		case "set_category":
			if req.CategoryID == 0 {
				response.BadRequest(c, "Vui lòng chọn thể loại")
				return
			}
			updates = map[string]interface{}{"category_id": req.CategoryID}
		}
		res := h.db.Model(&domain.Audio{}).Where("id IN ?", req.IDs).Updates(updates)
		if res.Error != nil {
			response.Internal(c, "Không thể cập nhật audio")
			return
		}
		if req.Action == "vip" {
			_ = h.db.Model(&domain.Episode{}).Where("audio_id IN ? AND episode_number > 1", req.IDs).Update("is_vip", true).Error
		} else if req.Action == "free" {
			_ = h.db.Model(&domain.Episode{}).Where("audio_id IN ?", req.IDs).Update("is_vip", false).Error
		}
		if req.Action == "set_category" {
			h.notifyTaxonomyChanged()
		}
		h.audit(c, "bulk_audios_"+req.Action, "audio", fmt.Sprintf("%d", res.RowsAffected), "", "")
		response.OK(c, gin.H{"updated": res.RowsAffected}, nil)

	case "add_tag":
		tagName := strings.TrimSpace(strings.TrimPrefix(req.Tag, "#"))
		slug := logic.FormatSlug(tagName)
		if tagName == "" || slug == "" {
			response.BadRequest(c, "Tên thẻ không hợp lệ")
			return
		}
		var tag domain.Tag
		h.db.Where(domain.Tag{Name: tagName}).Attrs(domain.Tag{Slug: slug}).FirstOrCreate(&tag)
		if tag.ID == 0 {
			response.Internal(c, "Không thể tạo thẻ")
			return
		}
		var existing []uint
		h.db.Table("audio_tags").Where("tag_id = ? AND audio_id IN ?", tag.ID, req.IDs).Pluck("audio_id", &existing)
		has := map[uint]bool{}
		for _, id := range existing {
			has[id] = true
		}
		added := 0
		for _, aid := range req.IDs {
			if !has[aid] {
				if err := h.db.Exec("INSERT INTO audio_tags (audio_id, tag_id) VALUES (?, ?)", aid, tag.ID).Error; err == nil {
					added++
				}
			}
		}
		h.notifyTaxonomyChanged()
		h.audit(c, "bulk_audios_add_tag", "audio", fmt.Sprintf("%d", added), tagName, "")
		response.OK(c, gin.H{"updated": added}, nil)

	case "delete":
		err := h.db.Transaction(func(tx *gorm.DB) error {
			for _, stmt := range []string{
				"DELETE FROM audio_tags WHERE audio_id IN ?",
				"DELETE FROM listening_progress WHERE audio_id IN ?",
				"DELETE FROM listening_history WHERE audio_id IN ?",
				"DELETE FROM favorites WHERE audio_id IN ?",
				"DELETE FROM episodes WHERE audio_id IN ?",
			} {
				if err := tx.Exec(stmt, req.IDs).Error; err != nil {
					return err
				}
			}
			return tx.Where("id IN ?", req.IDs).Delete(&domain.Audio{}).Error
		})
		if err != nil {
			response.Internal(c, "Không thể xóa hàng loạt audio")
			return
		}
		h.notifyTaxonomyChanged()
		h.audit(c, "bulk_audios_delete", "audio", fmt.Sprintf("%d", len(req.IDs)), "", "")
		response.OK(c, gin.H{"updated": len(req.IDs)}, nil)

	default:
		response.BadRequest(c, "Thao tác không hợp lệ")
	}
}

func (h *Handler) ImportBatch(c *gin.Context) {
	var req struct {
		URLs              []string `json:"urls"`
		CategoryID        uint     `json:"categoryId"`
		Tags              []string `json:"tags"`
		BlockSizeSeconds  int      `json:"blockSizeSeconds"`
		IsVIPOnly         bool     `json:"isVipOnly"`
		FreeEpisodesCount *int     `json:"freeEpisodesCount"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.URLs) == 0 {
		response.BadRequest(c, "Vui lòng nhập ít nhất 1 đường dẫn YouTube")
		return
	}
	if len(req.URLs) > 30 {
		response.BadRequest(c, "Tối đa 30 đường dẫn mỗi lần")
		return
	}

	adminID := middleware.GetCurrentUserID(c)
	blockSize := req.BlockSizeSeconds
	if blockSize <= 0 {
		blockSize = 14400
	}
	freeCount := 1
	if req.FreeEpisodesCount != nil && *req.FreeEpisodesCount >= 0 {
		freeCount = *req.FreeEpisodesCount
	}
	catID := req.CategoryID
	if catID == 0 {
		var cat domain.Category
		h.db.Order("id ASC").First(&cat)
		catID = cat.ID
	}

	var tagsToAdd []domain.Tag
	seenTags := map[string]bool{}
	for _, raw := range req.Tags {
		name := strings.TrimSpace(strings.TrimPrefix(raw, "#"))
		slug := logic.FormatSlug(name)
		if name == "" || slug == "" || seenTags[slug] {
			continue
		}
		seenTags[slug] = true
		var tag domain.Tag
		h.db.Where(domain.Tag{Name: name}).Attrs(domain.Tag{Slug: slug}).FirstOrCreate(&tag)
		if tag.ID > 0 {
			tagsToAdd = append(tagsToAdd, tag)
		}
	}

	type batchItemResult struct {
		URL     string `json:"url"`
		Status  string `json:"status"` // created | duplicate | failed
		Title   string `json:"title,omitempty"`
		AudioID uint   `json:"audioId,omitempty"`
		Error   string `json:"error,omitempty"`
	}
	type preparedImport struct {
		rawURL string
		vid    string
		exist  *domain.Audio
		meta   *external.YouTubeMetadata
		errMsg string
	}

	cleanedURLs := make([]string, 0, len(req.URLs))
	for _, rawURL := range req.URLs {
		if u := strings.TrimSpace(rawURL); u != "" {
			cleanedURLs = append(cleanedURLs, u)
		}
	}

	prepped := make([]preparedImport, len(cleanedURLs))
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup
	for i, u := range cleanedURLs {
		prepped[i].rawURL = u
		vidRes := logic.ExtractYouTubeVideoID(u)
		if vidRes.IsError() {
			prepped[i].errMsg = vidRes.Error().Error()
			continue
		}
		vid := vidRes.MustGet()
		prepped[i].vid = vid

		var exist domain.Audio
		if err := h.db.Where("youtube_video_id = ?", vid).First(&exist).Error; err == nil {
			prepped[i].exist = &exist
			continue
		}

		wg.Add(1)
		go func(idx int, videoID string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			meta, err := external.FetchYouTubeMetadata(videoID)
			if err != nil {
				prepped[idx].errMsg = err.Error()
				return
			}
			prepped[idx].meta = meta
		}(i, vid)
	}
	wg.Wait()

	results := make([]batchItemResult, 0, len(prepped))
	created, dup, failed := 0, 0, 0
	seenVids := map[string]bool{}

	for _, item := range prepped {
		if item.errMsg != "" {
			failed++
			results = append(results, batchItemResult{URL: item.rawURL, Status: "failed", Error: item.errMsg})
			continue
		}
		if item.exist != nil {
			dup++
			results = append(results, batchItemResult{URL: item.rawURL, Status: "duplicate", Title: item.exist.Title, AudioID: item.exist.ID})
			continue
		}
		if seenVids[item.vid] {
			dup++
			results = append(results, batchItemResult{URL: item.rawURL, Status: "duplicate", Title: item.meta.Title})
			continue
		}
		seenVids[item.vid] = true

		var existAgain domain.Audio
		if err := h.db.Where("youtube_video_id = ?", item.vid).First(&existAgain).Error; err == nil {
			dup++
			results = append(results, batchItemResult{URL: item.rawURL, Status: "duplicate", Title: existAgain.Title, AudioID: existAgain.ID})
			continue
		}

		meta := item.meta
		dur := external.InferDurationFromMetadata(meta, 0)
		if dur <= 0 {
			dur = blockSize
		}

		audio := domain.Audio{
			YoutubeVideoID:       item.vid,
			YoutubeURL:           fmt.Sprintf("https://www.youtube.com/watch?v=%s", item.vid),
			Title:                meta.Title,
			Author:               meta.Author,
			Description:          meta.Description,
			ThumbnailURL:         meta.ThumbnailURL,
			TotalDurationSeconds: dur,
			CategoryID:           catID,
			Status:               domain.StatusActive,
			IsVIPOnly:            req.IsVIPOnly,
			FreeEpisodesCount:    &freeCount,
			CreatedBy:            adminID,
		}
		txErr := h.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&audio).Error; err != nil {
				return err
			}
			for _, d := range logic.ComputeLogicalEpisodes(audio.ID, dur, blockSize) {
				isVIP := req.IsVIPOnly && (freeCount == 0 || d.EpisodeNumber > freeCount)
				if err := tx.Create(&domain.Episode{
					AudioID:         audio.ID,
					EpisodeNumber:   d.EpisodeNumber,
					Title:           d.Title,
					StartSeconds:    d.StartSeconds,
					EndSeconds:      d.EndSeconds,
					DurationSeconds: d.DurationSeconds,
					IsVIP:           isVIP,
				}).Error; err != nil {
					return err
				}
			}
			if len(tagsToAdd) > 0 {
				_ = tx.Model(&audio).Association("Tags").Append(tagsToAdd)
			}
			return nil
		})
		if txErr != nil {
			failed++
			results = append(results, batchItemResult{URL: item.rawURL, Status: "failed", Error: txErr.Error()})
			continue
		}
		created++
		results = append(results, batchItemResult{URL: item.rawURL, Status: "created", Title: audio.Title, AudioID: audio.ID})
	}

	if created > 0 {
		h.notifyTaxonomyChanged()
		h.audit(c, "import_batch", "audio", fmt.Sprintf("%d", created), "", fmt.Sprintf("created=%d dup=%d failed=%d", created, dup, failed))
	}

	response.OK(c, gin.H{
		"created":   created,
		"duplicate": dup,
		"failed":    failed,
		"results":   results,
	}, nil)
}

func (h *Handler) CheckStreamsBatch(c *gin.Context) {
	if h.streamExtractor == nil {
		response.Internal(c, "Stream extractor chưa được cấu hình")
		return
	}
	var req struct {
		IDs []uint `json:"ids"`
	}
	_ = c.ShouldBindJSON(&req)

	var audios []domain.Audio
	q := h.db.Model(&domain.Audio{})
	if len(req.IDs) > 0 {
		q = q.Where("id IN ?", req.IDs).Limit(20)
	} else {
		q = q.Where("stream_status <> ? OR stream_status IS NULL", domain.StreamStatusOK).Order("updated_at DESC").Limit(15)
	}
	q.Find(&audios)

	type streamCheckOutcome struct {
		audio      domain.Audio
		err        error
		mime       string
		durationMs int64
	}
	outcomes := make([]streamCheckOutcome, len(audios))
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup
	for i, a := range audios {
		outcomes[i].audio = a
		wg.Add(1)
		go func(idx int, aud domain.Audio) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
			info, err := h.streamExtractor.Extract(ctx, aud.YoutubeVideoID)
			cancel()
			outcomes[idx].err = err
			if err == nil {
				outcomes[idx].mime = info.MIME
				outcomes[idx].durationMs = info.ApproxDurationMs
			}
		}(i, a)
	}
	wg.Wait()

	okCount, failCount := 0, 0
	for _, res := range outcomes {
		a := res.audio
		now := time.Now().UTC()
		if res.err != nil {
			failCount++
			h.db.Model(&domain.Audio{}).Where("id = ?", a.ID).Updates(map[string]interface{}{
				"stream_status":     domain.StreamStatusFailed,
				"stream_checked_at": &now,
			})
			continue
		}
		okCount++
		ups := map[string]interface{}{
			"stream_status":     domain.StreamStatusOK,
			"stream_checked_at": &now,
			"audio_mime":        res.mime,
		}
		if a.TotalDurationSeconds <= 0 && res.durationMs > 0 {
			durSec := int(res.durationMs / 1000)
			ups["duration_seconds"] = durSec
			var epCount int64
			h.db.Model(&domain.Episode{}).Where("audio_id = ?", a.ID).Count(&epCount)
			if epCount == 1 {
				h.db.Model(&domain.Episode{}).Where("audio_id = ?", a.ID).Updates(map[string]interface{}{
					"end_seconds":      durSec,
					"duration_seconds": durSec,
				})
			}
		}
		h.db.Model(&domain.Audio{}).Where("id = ?", a.ID).Updates(ups)
	}

	h.audit(c, "check_streams_batch", "audio", fmt.Sprintf("%d", len(audios)), "", fmt.Sprintf("ok=%d failed=%d", okCount, failCount))
	response.OK(c, gin.H{"checked": len(audios), "ok": okCount, "failed": failCount}, nil)
}

func (h *Handler) ImportStats(c *gin.Context) {
	now := time.Now().UTC()
	startOfDay := startOfVNDayUTC(now)
	cfg := middleware.GetSiteConfig(h.db)

	type row struct {
		UserID   uint   `json:"userId"`
		Username string `json:"username"`
		Role     string `json:"role"`
		Today    int64  `json:"today"`
		Total    int64  `json:"total"`
	}
	var totals []struct {
		CreatedBy uint
		Total     int64
	}
	h.db.Model(&domain.Audio{}).Select("created_by, COUNT(*) AS total").Where("created_by > 0").Group("created_by").Order("total DESC").Limit(30).Scan(&totals)

	var todays []struct {
		CreatedBy uint
		Today     int64
	}
	h.db.Model(&domain.Audio{}).Select("created_by, COUNT(*) AS today").Where("created_by > 0 AND created_at >= ?", startOfDay).Group("created_by").Scan(&todays)
	todayMap := map[uint]int64{}
	for _, t := range todays {
		todayMap[t.CreatedBy] = t.Today
	}

	ids := make([]uint, 0, len(totals))
	for _, t := range totals {
		ids = append(ids, t.CreatedBy)
	}
	users := map[uint]domain.User{}
	if len(ids) > 0 {
		var us []domain.User
		h.db.Select("id, username, role").Where("id IN ?", ids).Find(&us)
		for _, u := range us {
			users[u.ID] = u
		}
	}

	items := make([]row, 0, len(totals))
	for _, t := range totals {
		u := users[t.CreatedBy]
		name := u.Username
		if name == "" {
			name = fmt.Sprintf("User #%d", t.CreatedBy)
		}
		items = append(items, row{
			UserID:   t.CreatedBy,
			Username: name,
			Role:     u.Role,
			Today:    todayMap[t.CreatedBy],
			Total:    t.Total,
		})
	}

	response.OK(c, gin.H{
		"dailyLimit":      cfg.FreeImportDailyLimit,
		"allowUserImport": cfg.AllowUserImport,
		"items":           items,
	}, nil)
}

// ---------- broadcast ----------

func (h *Handler) Broadcast(c *gin.Context) {
	var req struct {
		Title    string `json:"title"`
		Message  string `json:"message"`
		Link     string `json:"link"`
		Type     string `json:"type"`
		Audience string `json:"audience"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu không hợp lệ")
		return
	}
	req.Title, req.Message = strings.TrimSpace(req.Title), strings.TrimSpace(req.Message)
	if req.Title == "" || req.Message == "" {
		response.BadRequest(c, "Vui lòng nhập tiêu đề và nội dung")
		return
	}
	kind := "SYSTEM"
	if strings.ToUpper(req.Type) == "PROMOTION" {
		kind = "PROMOTION"
	}
	now := time.Now().UTC()
	tx := h.db.Model(&domain.User{}).Where("is_guest = ? AND is_banned = ?", false, false)
	switch req.Audience {
	case "vip", "free":
		tx = applyUserFilter(tx, req.Audience, now)
	case "admin":
		tx = applyUserFilter(tx, "admin", now)
	}
	var ids []uint
	if err := tx.Pluck("id", &ids).Error; err != nil {
		response.Internal(c, "Không thể xác định người nhận")
		return
	}
	delivered, _ := notification.CreateBatchNotifications(
		h.db,
		ids,
		truncate(req.Title, 200),
		truncate(req.Message, 1000),
		kind,
		truncate(strings.TrimSpace(req.Link), 255),
	)
	h.audit(c, "broadcast", "notification", req.Audience, req.Title, fmt.Sprintf("%d/%d", delivered, len(ids)))
	response.OK(c, gin.H{"targeted": len(ids), "delivered": delivered}, nil)
}

// ---------- dashboard ----------

func (h *Handler) Dashboard(c *gin.Context) {
	now := time.Now().UTC()
	count := func(model interface{}, query string, args ...interface{}) int64 {
		var n int64
		t := h.db.Model(model)
		if query != "" {
			t = t.Where(query, args...)
		}
		t.Count(&n)
		return n
	}
	startOfDayVN := startOfVNDayUTC(now)
	since := startOfDayVN.AddDate(0, 0, -13)
	week := now.Add(-7 * 24 * time.Hour)

	var listenSecs int64
	h.db.Model(&domain.ListeningHistory{}).Select("COALESCE(SUM(duration_listened), 0)").Scan(&listenSecs)
	var revenue, revenue30 int64
	h.db.Model(&domain.MembershipOrder{}).Where("status = ?", "PAID").Select("COALESCE(SUM(amount), 0)").Scan(&revenue)
	h.db.Model(&domain.MembershipOrder{}).Where("status = ? AND paid_at >= ?", "PAID", now.Add(-30*24*time.Hour)).
		Select("COALESCE(SUM(amount), 0)").Scan(&revenue30)

	// 14-day series (múi giờ Việt Nam UTC+7)
	type point struct {
		Date          string `json:"date"`
		Users         int    `json:"users"`
		Revenue       int64  `json:"revenue"`
		ListenSeconds int64  `json:"listenSeconds"`
	}
	series := make([]point, 14)
	idx := map[string]int{}
	vnStart := since.In(vnLoc)
	for i := 0; i < 14; i++ {
		d := vnStart.AddDate(0, 0, i).Format("2006-01-02")
		series[i] = point{Date: d}
		idx[d] = i
	}
	var joined []time.Time
	h.db.Model(&domain.User{}).Where("is_guest = ? AND created_at >= ?", false, since).Pluck("created_at", &joined)
	for _, t := range joined {
		if i, ok := idx[t.In(vnLoc).Format("2006-01-02")]; ok {
			series[i].Users++
		}
	}
	var paid []domain.MembershipOrder
	h.db.Select("amount, paid_at").Where("status = ? AND paid_at >= ?", "PAID", since).Find(&paid)
	for _, o := range paid {
		if o.PaidAt == nil {
			continue
		}
		if i, ok := idx[o.PaidAt.In(vnLoc).Format("2006-01-02")]; ok {
			series[i].Revenue += int64(o.Amount)
		}
	}
	var hist []domain.ListeningHistory
	h.db.Select("duration_listened, created_at").Where("created_at >= ?", since).Find(&hist)
	for _, hi := range hist {
		if i, ok := idx[hi.CreatedAt.In(vnLoc).Format("2006-01-02")]; ok {
			series[i].ListenSeconds += int64(hi.DurationListened)
		}
	}

	// top audios
	var top []struct {
		AudioID uint
		Plays   int64
		Secs    int64
	}
	h.db.Model(&domain.ListeningHistory{}).Select("audio_id, COUNT(*) AS plays, COALESCE(SUM(duration_listened), 0) AS secs").
		Group("audio_id").Order("plays DESC").Limit(5).Scan(&top)
	topIDs := make([]uint, 0, len(top))
	for _, t := range top {
		topIDs = append(topIDs, t.AudioID)
	}
	titles := map[uint]domain.Audio{}
	if len(topIDs) > 0 {
		var as []domain.Audio
		h.db.Select("id, title, thumbnail_url").Where("id IN ?", topIDs).Find(&as)
		for _, a := range as {
			titles[a.ID] = a
		}
	}
	topAudios := make([]gin.H, 0, len(top))
	for _, t := range top {
		a, ok := titles[t.AudioID]
		if !ok {
			continue
		}
		topAudios = append(topAudios, gin.H{"id": a.ID, "title": a.Title, "thumbnailUrl": a.ThumbnailURL, "plays": t.Plays, "seconds": t.Secs})
	}
	sort.SliceStable(topAudios, func(i, j int) bool { return topAudios[i]["plays"].(int64) > topAudios[j]["plays"].(int64) })

	var recentUsers []domain.User
	h.db.Where("is_guest = ?", false).Order("created_at DESC").Limit(5).Find(&recentUsers)
	var recentOrders []domain.MembershipOrder
	h.db.Omit("qr_code_data").Order("created_at DESC").Limit(5).Find(&recentOrders)
	uids := make([]uint, 0, len(recentOrders))
	for _, o := range recentOrders {
		uids = append(uids, o.UserID)
	}
	names := map[uint]string{}
	if len(uids) > 0 {
		var us []domain.User
		h.db.Select("id, username").Where("id IN ?", uids).Find(&us)
		for _, u := range us {
			names[u.ID] = u.Username
		}
	}
	orders := make([]orderRow, 0, len(recentOrders))
	for _, o := range recentOrders {
		name := names[o.UserID]
		if name == "" {
			name = "Tài khoản đã xóa"
		}
		orders = append(orders, orderRow{MembershipOrder: o, Username: name})
	}

	vipActive := count(&domain.User{}, "is_guest = ? AND role <> ? AND membership = ? AND (vip_expires_at IS NULL OR vip_expires_at > ?)",
		false, domain.RoleAdmin, domain.MembershipVIP, now)

	response.OK(c, gin.H{
		"users": gin.H{
			"total":  count(&domain.User{}, "is_guest = ?", false),
			"new7d":  count(&domain.User{}, "is_guest = ? AND created_at >= ?", false, week),
			"vip":    vipActive,
			"banned": count(&domain.User{}, "is_banned = ?", true),
			"expiring": count(&domain.User{}, "role <> ? AND membership = ? AND vip_expires_at IS NOT NULL AND vip_expires_at > ? AND vip_expires_at <= ?",
				domain.RoleAdmin, domain.MembershipVIP, now, now.Add(7*24*time.Hour)),
		},
		"content": gin.H{
			"audios":   count(&domain.Audio{}, ""),
			"hidden":   count(&domain.Audio{}, "status = ?", domain.StatusHidden),
			"episodes": count(&domain.Episode{}, ""),
			"failed":   count(&domain.Audio{}, "stream_status = ?", domain.StreamStatusFailed),
		},
		"revenue": gin.H{
			"total":   revenue,
			"last30":  revenue30,
			"pending": count(&domain.MembershipOrder{}, "status = ? AND expires_at > ?", "PENDING", now),
		},
		"engagement": gin.H{
			"listenSeconds": listenSecs,
			"favorites":     count(&domain.Favorite{}, ""),
			"messages":      count(&domain.CommunityMessage{}, ""),
			"openTickets":   count(&domain.SupportTicket{}, "status IN ?", []string{"PENDING", "IN_PROGRESS"}),
		},
		"series":       series,
		"topAudios":    topAudios,
		"recentUsers":  recentUsers,
		"recentOrders": orders,
	}, nil)
}
