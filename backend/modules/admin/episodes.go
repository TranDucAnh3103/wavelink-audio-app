package admin

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type episodeAdminRow struct {
	domain.Episode
	InProgressCount int64 `json:"inProgressCount"`
	CompletedCount  int64 `json:"completedCount"`
}

func (h *Handler) ListAudioEpisodes(c *gin.Context) {
	audioID, ok := paramID(c)
	if !ok {
		return
	}
	var audio domain.Audio
	if err := h.db.First(&audio, audioID).Error; err != nil {
		response.NotFound(c, "Không tìm thấy Audio")
		return
	}

	var eps []domain.Episode
	if err := h.db.Where("audio_id = ?", audioID).Order("episode_number ASC").Find(&eps).Error; err != nil {
		response.Internal(c, "Lỗi tải danh sách tập")
		return
	}

	inProg := map[uint]int64{}
	done := map[uint]int64{}
	var rows []struct {
		EpisodeID uint
		Completed bool
		N         int64
	}
	h.db.Model(&domain.ListeningProgress{}).
		Select("episode_id, completed, COUNT(*) AS n").
		Where("audio_id = ?", audioID).
		Group("episode_id, completed").
		Scan(&rows)
	for _, r := range rows {
		if r.Completed {
			done[r.EpisodeID] += r.N
		} else {
			inProg[r.EpisodeID] += r.N
		}
	}

	items := make([]episodeAdminRow, 0, len(eps))
	for _, ep := range eps {
		items = append(items, episodeAdminRow{
			Episode:         ep,
			InProgressCount: inProg[ep.ID],
			CompletedCount:  done[ep.ID],
		})
	}

	response.OK(c, gin.H{
		"audio": audio,
		"items": items,
	}, nil)
}

type chapterInput struct {
	Title        string `json:"title"`
	StartSeconds int    `json:"startSeconds"`
	EndSeconds   int    `json:"endSeconds"`
	IsVIP        *bool  `json:"isVip"`
}

// BatchChapters replaces or updates episodes for an audio from parsed chapter timestamps.
func (h *Handler) BatchChapters(c *gin.Context) {
	audioID, ok := paramID(c)
	if !ok {
		return
	}
	var req struct {
		Chapters []chapterInput `json:"chapters"`
		RawText  string         `json:"rawText"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu chương không hợp lệ")
		return
	}

	var audio domain.Audio
	if err := h.db.First(&audio, audioID).Error; err != nil {
		response.NotFound(c, "Không tìm thấy Audio")
		return
	}

	chapters := req.Chapters
	if len(chapters) == 0 && strings.TrimSpace(req.RawText) != "" {
		chapters = parseChapterText(req.RawText, audio.TotalDurationSeconds)
	}
	if len(chapters) == 0 {
		response.BadRequest(c, "Vui lòng nhập ít nhất 1 mốc thời gian hợp lệ (vd: 00:00 Tập 1)")
		return
	}

	sort.SliceStable(chapters, func(i, j int) bool {
		return chapters[i].StartSeconds < chapters[j].StartSeconds
	})

	// Tự điền endSeconds nếu chưa có dựa theo mốc kế tiếp hoặc tổng thời lượng audio
	maxEnd := audio.TotalDurationSeconds
	for i := range chapters {
		if chapters[i].StartSeconds < 0 {
			chapters[i].StartSeconds = 0
		}
		if chapters[i].EndSeconds <= chapters[i].StartSeconds {
			if i+1 < len(chapters) && chapters[i+1].StartSeconds > chapters[i].StartSeconds {
				chapters[i].EndSeconds = chapters[i+1].StartSeconds
			} else if maxEnd > chapters[i].StartSeconds {
				chapters[i].EndSeconds = maxEnd
			} else {
				chapters[i].EndSeconds = chapters[i].StartSeconds + 1800
			}
		}
		if chapters[i].EndSeconds > maxEnd {
			maxEnd = chapters[i].EndSeconds
		}
		if strings.TrimSpace(chapters[i].Title) == "" {
			chapters[i].Title = fmt.Sprintf("Tập %d", i+1)
		}
	}

	freeLimit := 1
	if audio.FreeEpisodesCount != nil {
		freeLimit = *audio.FreeEpisodesCount
	}

	var result []domain.Episode
	err := h.db.Transaction(func(tx *gorm.DB) error {
		if maxEnd > audio.TotalDurationSeconds {
			_ = tx.Model(&audio).Update("duration_seconds", maxEnd).Error
		}
		var existing []domain.Episode
		if err := tx.Where("audio_id = ?", audio.ID).Order("episode_number ASC").Find(&existing).Error; err != nil {
			return err
		}

		for i, ch := range chapters {
			isVIP := audio.IsVIPOnly && (freeLimit == 0 || (i+1) > freeLimit)
			if ch.IsVIP != nil {
				isVIP = *ch.IsVIP
			}
			if i < len(existing) {
				ep := existing[i]
				ep.EpisodeNumber = i + 1
				ep.Title = strings.TrimSpace(ch.Title)
				ep.StartSeconds = ch.StartSeconds
				ep.EndSeconds = ch.EndSeconds
				ep.DurationSeconds = ch.EndSeconds - ch.StartSeconds
				ep.IsVIP = isVIP
				if err := tx.Save(&ep).Error; err != nil {
					return err
				}
				result = append(result, ep)
			} else {
				ep := domain.Episode{
					AudioID:         audio.ID,
					EpisodeNumber:   i + 1,
					Title:           strings.TrimSpace(ch.Title),
					StartSeconds:    ch.StartSeconds,
					EndSeconds:      ch.EndSeconds,
					DurationSeconds: ch.EndSeconds - ch.StartSeconds,
					IsVIP:           isVIP,
				}
				if err := tx.Create(&ep).Error; err != nil {
					return err
				}
				result = append(result, ep)
			}
		}

		for j := len(chapters); j < len(existing); j++ {
			_ = tx.Where("episode_id = ?", existing[j].ID).Delete(&domain.ListeningProgress{}).Error
			_ = tx.Where("episode_id = ?", existing[j].ID).Delete(&domain.ListeningHistory{}).Error
			_ = tx.Delete(&domain.Episode{}, existing[j].ID).Error
		}
		return nil
	})
	if err != nil {
		response.Internal(c, "Không thể áp dụng danh sách chương: "+err.Error())
		return
	}

	h.audit(c, "episodes_batch_chapters", "audio", fmt.Sprint(audio.ID), audio.Title, fmt.Sprintf("%d tập", len(result)))
	response.OK(c, result, nil)
}

func parseChapterText(raw string, totalDur int) []chapterInput {
	lines := strings.Split(raw, "\n")
	var out []chapterInput
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		sec, ok := parseTimestamp(fields[0])
		title := ""
		if ok {
			title = strings.TrimSpace(strings.TrimPrefix(line, fields[0]))
		} else if len(fields) >= 2 {
			if s2, ok2 := parseTimestamp(fields[len(fields)-1]); ok2 {
				sec = s2
				ok = true
				title = strings.TrimSpace(strings.TrimSuffix(line, fields[len(fields)-1]))
			}
		}
		if !ok {
			continue
		}
		title = strings.TrimLeft(title, "-–—:| ")
		out = append(out, chapterInput{Title: title, StartSeconds: sec})
	}
	if len(out) == 1 && out[0].EndSeconds == 0 && totalDur > out[0].StartSeconds {
		out[0].EndSeconds = totalDur
	}
	return out
}

func parseTimestamp(s string) (int, bool) {
	s = strings.Trim(s, "[]()")
	parts := strings.Split(s, ":")
	if len(parts) < 2 || len(parts) > 3 {
		return 0, false
	}
	nums := make([]int, len(parts))
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return 0, false
		}
		nums[i] = n
	}
	if len(nums) == 2 {
		return nums[0]*60 + nums[1], true
	}
	return nums[0]*3600 + nums[1]*60 + nums[2], true
}

func (h *Handler) BulkEpisodes(c *gin.Context) {
	var req struct {
		AudioID uint   `json:"audioId"`
		IDs     []uint `json:"ids"`
		Action  string `json:"action"` // vip | free | delete | renumber | rename_prefix
		Prefix  string `json:"prefix"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu không hợp lệ")
		return
	}

	switch req.Action {
	case "vip", "free":
		if len(req.IDs) == 0 {
			response.BadRequest(c, "Chưa chọn tập nào")
			return
		}
		val := req.Action == "vip"
		res := h.db.Model(&domain.Episode{}).Where("id IN ?", req.IDs).Update("is_vip", val)
		if res.Error != nil {
			response.Internal(c, "Không thể cập nhật tập")
			return
		}
		h.audit(c, "bulk_episodes_"+req.Action, "episode", fmt.Sprintf("%d", res.RowsAffected), "", fmt.Sprintf("ids=%d", len(req.IDs)))
		response.OK(c, gin.H{"updated": res.RowsAffected}, nil)

	case "delete":
		if len(req.IDs) == 0 {
			response.BadRequest(c, "Chưa chọn tập nào")
			return
		}
		var first domain.Episode
		_ = h.db.Where("id IN ?", req.IDs).First(&first).Error
		audioID := req.AudioID
		if audioID == 0 {
			audioID = first.AudioID
		}
		err := h.db.Transaction(func(tx *gorm.DB) error {
			_ = tx.Where("episode_id IN ?", req.IDs).Delete(&domain.ListeningProgress{}).Error
			_ = tx.Where("episode_id IN ?", req.IDs).Delete(&domain.ListeningHistory{}).Error
			if err := tx.Where("id IN ?", req.IDs).Delete(&domain.Episode{}).Error; err != nil {
				return err
			}
			if audioID > 0 {
				var rem []domain.Episode
				tx.Where("audio_id = ?", audioID).Order("episode_number ASC").Find(&rem)
				for i, ep := range rem {
					if ep.EpisodeNumber != i+1 {
						_ = tx.Model(&domain.Episode{}).Where("id = ?", ep.ID).Update("episode_number", i+1).Error
					}
				}
			}
			return nil
		})
		if err != nil {
			response.Internal(c, "Không thể xóa tập")
			return
		}
		h.audit(c, "bulk_episodes_delete", "episode", fmt.Sprintf("%d", len(req.IDs)), "", fmt.Sprintf("audio=%d", audioID))
		response.OK(c, gin.H{"updated": len(req.IDs)}, nil)

	case "renumber":
		if req.AudioID == 0 {
			response.BadRequest(c, "Thiếu audioId")
			return
		}
		var eps []domain.Episode
		h.db.Where("audio_id = ?", req.AudioID).Order("start_seconds ASC, id ASC").Find(&eps)
		err := h.db.Transaction(func(tx *gorm.DB) error {
			for i, ep := range eps {
				if err := tx.Model(&domain.Episode{}).Where("id = ?", ep.ID).Update("episode_number", -(i + 1)).Error; err != nil {
					return err
				}
			}
			for i, ep := range eps {
				if err := tx.Model(&domain.Episode{}).Where("id = ?", ep.ID).Update("episode_number", i+1).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			response.Internal(c, "Không thể đánh số lại tập")
			return
		}
		h.audit(c, "bulk_episodes_renumber", "audio", fmt.Sprintf("%d", req.AudioID), "", fmt.Sprintf("%d tập", len(eps)))
		response.OK(c, gin.H{"updated": len(eps)}, nil)

	case "rename_prefix":
		if len(req.IDs) == 0 || strings.TrimSpace(req.Prefix) == "" {
			response.BadRequest(c, "Vui lòng chọn tập và nhập tiền tố tên")
			return
		}
		var eps []domain.Episode
		h.db.Where("id IN ?", req.IDs).Order("episode_number ASC").Find(&eps)
		prefix := strings.TrimSpace(req.Prefix)
		for _, ep := range eps {
			_ = h.db.Model(&domain.Episode{}).Where("id = ?", ep.ID).
				Update("title", fmt.Sprintf("%s %d", prefix, ep.EpisodeNumber)).Error
		}
		h.audit(c, "bulk_episodes_rename_prefix", "episode", fmt.Sprintf("%d", len(eps)), prefix, "")
		response.OK(c, gin.H{"updated": len(eps)}, nil)

	default:
		response.BadRequest(c, "Thao tác không hợp lệ")
	}
}
