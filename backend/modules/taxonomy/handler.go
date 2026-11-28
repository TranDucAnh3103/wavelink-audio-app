package taxonomy

import (
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/core/logic"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	db        *gorm.DB
	cacheMu   sync.RWMutex
	catCache  []domain.Category
	catExpiry time.Time
	tagCache  []domain.Tag
	tagExpiry time.Time
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{db: db}
}

// InvalidateCache clears category and tag caches immediately.
func (h *Handler) InvalidateCache() {
	h.cacheMu.Lock()
	defer h.cacheMu.Unlock()
	h.catExpiry = time.Time{}
	h.tagExpiry = time.Time{}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	// Categories
	rg.GET("/categories", h.GetCategories)
	rg.POST("/categories", middleware.RequireAuth(), middleware.RequireAdmin(), h.CreateCategory)
	rg.POST("/categories/merge", middleware.RequireAuth(), middleware.RequireAdmin(), h.MergeCategories)
	rg.PUT("/categories/:id", middleware.RequireAuth(), middleware.RequireAdmin(), h.UpdateCategory)
	rg.DELETE("/categories/:id", middleware.RequireAuth(), middleware.RequireAdmin(), h.DeleteCategory)

	// Tags
	rg.GET("/tags", h.GetTags)
	rg.POST("/tags", middleware.RequireAuth(), middleware.RequireAdmin(), h.CreateTag)
	rg.POST("/tags/merge", middleware.RequireAuth(), middleware.RequireAdmin(), h.MergeTags)
	rg.PUT("/tags/:id", middleware.RequireAuth(), middleware.RequireAdmin(), h.UpdateTag)
	rg.DELETE("/tags/unused", middleware.RequireAuth(), middleware.RequireAdmin(), h.CleanupUnusedTags)
	rg.DELETE("/tags/:id", middleware.RequireAuth(), middleware.RequireAdmin(), h.DeleteTag)
}

func (h *Handler) GetCategories(c *gin.Context) {
	includeHidden := c.Query("includeHidden") == "true" && middleware.GetCurrentUserRole(c) == domain.RoleAdmin

	if !includeHidden {
		c.Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
		h.cacheMu.RLock()
		if time.Now().Before(h.catExpiry) && len(h.catCache) > 0 {
			cached := h.catCache
			h.cacheMu.RUnlock()
			response.OK(c, cached, nil)
			return
		}
		h.cacheMu.RUnlock()
	}

	var categories []domain.Category
	if err := h.db.Order("name ASC").Find(&categories).Error; err != nil {
		response.Internal(c, "Lỗi lấy danh sách thể loại")
		return
	}

	type catCount struct {
		CategoryID uint
		Total      int
	}
	var counts []catCount
	q := h.db.Model(&domain.Audio{}).Select("category_id, count(*) as total")
	if !includeHidden {
		q = q.Where("status = ? OR status = '' OR status IS NULL", domain.StatusActive)
	}
	q.Group("category_id").Scan(&counts)

	countMap := make(map[uint]int)
	for _, cc := range counts {
		countMap[cc.CategoryID] = cc.Total
	}

	for i := range categories {
		categories[i].Count = countMap[categories[i].ID]
	}

	if !includeHidden {
		h.cacheMu.Lock()
		h.catCache = categories
		h.catExpiry = time.Now().Add(5 * time.Minute)
		h.cacheMu.Unlock()
	}

	response.OK(c, categories, nil)
}

func (h *Handler) CreateCategory(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		Color       string `json:"color"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Tên thể loại không được để trống")
		return
	}

	name := strings.TrimSpace(req.Name)
	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = logic.FormatSlug(name)
	}
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(name, " ", "-"))
	}
	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = "primary"
	}

	cat := domain.Category{
		Name:        name,
		Slug:        slug,
		Description: strings.TrimSpace(req.Description),
		Color:       color,
	}

	if err := h.db.Create(&cat).Error; err != nil {
		response.BadRequest(c, "Không thể tạo thể loại: trùng tên hoặc slug")
		return
	}

	h.InvalidateCache()
	middleware.RecordAudit(h.db, c, "category_create", "category", fmt.Sprint(cat.ID), cat.Name, cat.Slug)
	response.Created(c, cat)
}

func (h *Handler) UpdateCategory(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        string  `json:"name"`
		Slug        string  `json:"slug"`
		Description *string `json:"description"`
		Color       string  `json:"color"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu không hợp lệ")
		return
	}

	updates := map[string]interface{}{}
	if strings.TrimSpace(req.Name) != "" {
		updates["name"] = strings.TrimSpace(req.Name)
	}
	if strings.TrimSpace(req.Slug) != "" {
		updates["slug"] = strings.TrimSpace(req.Slug)
	}
	if req.Description != nil {
		updates["description"] = strings.TrimSpace(*req.Description)
	}
	if strings.TrimSpace(req.Color) != "" {
		updates["color"] = strings.TrimSpace(req.Color)
	}

	if len(updates) > 0 {
		if err := h.db.Model(&domain.Category{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			response.BadRequest(c, "Không thể cập nhật thể loại (trùng tên hoặc slug)")
			return
		}
	}

	h.InvalidateCache()
	var updated domain.Category
	if err := h.db.First(&updated, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy thể loại")
		return
	}
	middleware.RecordAudit(h.db, c, "category_update", "category", id, updated.Name, updated.Slug)
	response.OK(c, updated, nil)
}

func (h *Handler) DeleteCategory(c *gin.Context) {
	idVal, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil || idVal == 0 {
		response.BadRequest(c, "ID thể loại không hợp lệ")
		return
	}
	catID := uint(idVal)

	var fallback domain.Category
	h.db.Where("id <> ?", catID).Order("id ASC").First(&fallback)

	err = h.db.Transaction(func(tx *gorm.DB) error {
		// Chuyển các audio thuộc thể loại bị xóa sang thể loại dự phòng để không bị mồ côi
		var targetCat interface{} = nil
		if fallback.ID > 0 {
			targetCat = fallback.ID
		}
		if err := tx.Model(&domain.Audio{}).Where("category_id = ?", catID).Update("category_id", targetCat).Error; err != nil {
			return err
		}
		return tx.Delete(&domain.Category{}, catID).Error
	})
	if err != nil {
		response.Internal(c, "Lỗi xóa thể loại")
		return
	}
	h.InvalidateCache()
	middleware.RecordAudit(h.db, c, "category_delete", "category", fmt.Sprint(catID), "", fmt.Sprintf("fallback=%d", fallback.ID))
	response.OK(c, gin.H{"message": "Đã xóa thể loại", "fallbackCategoryId": fallback.ID}, nil)
}

func (h *Handler) MergeCategories(c *gin.Context) {
	var req struct {
		SourceID uint `json:"sourceId" binding:"required"`
		TargetID uint `json:"targetId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.SourceID == 0 || req.TargetID == 0 || req.SourceID == req.TargetID {
		response.BadRequest(c, "Vui lòng chọn 2 thể loại khác nhau để gộp")
		return
	}

	var src, dst domain.Category
	if err := h.db.First(&src, req.SourceID).Error; err != nil {
		response.NotFound(c, "Không tìm thấy thể loại nguồn")
		return
	}
	if err := h.db.First(&dst, req.TargetID).Error; err != nil {
		response.NotFound(c, "Không tìm thấy thể loại đích")
		return
	}

	var moved int64
	err := h.db.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&domain.Audio{}).Where("category_id = ?", src.ID).Update("category_id", dst.ID)
		if res.Error != nil {
			return res.Error
		}
		moved = res.RowsAffected
		return tx.Delete(&domain.Category{}, src.ID).Error
	})
	if err != nil {
		response.Internal(c, "Không thể gộp thể loại")
		return
	}

	h.InvalidateCache()
	middleware.RecordAudit(h.db, c, "category_merge", "category", fmt.Sprint(dst.ID), dst.Name, fmt.Sprintf("from=%d moved=%d", src.ID, moved))
	response.OK(c, gin.H{"movedAudios": moved, "targetId": dst.ID}, nil)
}

func (h *Handler) GetTags(c *gin.Context) {
	c.Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
	h.cacheMu.RLock()
	if time.Now().Before(h.tagExpiry) && len(h.tagCache) > 0 {
		cached := h.tagCache
		h.cacheMu.RUnlock()
		response.OK(c, cached, nil)
		return
	}
	h.cacheMu.RUnlock()

	var tags []domain.Tag
	if err := h.db.Order("name ASC").Find(&tags).Error; err != nil {
		response.Internal(c, "Lỗi lấy danh sách thẻ")
		return
	}

	type tagCount struct {
		TagID uint
		Total int
	}
	var counts []tagCount
	h.db.Table("audio_tags").
		Select("tag_id, count(*) as total").
		Group("tag_id").
		Scan(&counts)

	countMap := make(map[uint]int)
	for _, tc := range counts {
		countMap[tc.TagID] = tc.Total
	}

	for i := range tags {
		tags[i].Count = countMap[tags[i].ID]
	}

	h.cacheMu.Lock()
	h.tagCache = tags
	h.tagExpiry = time.Now().Add(5 * time.Minute)
	h.cacheMu.Unlock()

	response.OK(c, tags, nil)
}

func (h *Handler) CreateTag(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
		Slug string `json:"slug"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Tên thẻ không được để trống")
		return
	}

	name := strings.TrimSpace(strings.TrimPrefix(req.Name, "#"))
	if name == "" {
		response.BadRequest(c, "Tên thẻ không được để trống")
		return
	}
	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = logic.FormatSlug(name)
	}
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(name, " ", "-"))
	}

	tag := domain.Tag{
		Name: name,
		Slug: slug,
	}

	if err := h.db.Create(&tag).Error; err != nil {
		response.BadRequest(c, "Thẻ đã tồn tại")
		return
	}

	h.InvalidateCache()
	middleware.RecordAudit(h.db, c, "tag_create", "tag", fmt.Sprint(tag.ID), tag.Name, tag.Slug)
	response.Created(c, tag)
}

func (h *Handler) UpdateTag(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu không hợp lệ")
		return
	}

	var existing domain.Tag
	if err := h.db.First(&existing, id).Error; err != nil {
		response.NotFound(c, "Không tìm thấy thẻ")
		return
	}

	name := strings.TrimSpace(strings.TrimPrefix(req.Name, "#"))
	slug := strings.TrimSpace(req.Slug)
	updates := map[string]interface{}{}
	if name != "" {
		updates["name"] = name
		if slug == "" {
			slug = logic.FormatSlug(name)
		}
	}
	if slug != "" {
		updates["slug"] = slug
	}

	if len(updates) > 0 {
		if err := h.db.Model(&existing).Updates(updates).Error; err != nil {
			response.BadRequest(c, "Không thể cập nhật thẻ (trùng tên hoặc slug)")
			return
		}
	}

	h.InvalidateCache()
	h.db.First(&existing, id)
	middleware.RecordAudit(h.db, c, "tag_update", "tag", id, existing.Name, existing.Slug)
	response.OK(c, existing, nil)
}

func (h *Handler) DeleteTag(c *gin.Context) {
	idVal, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil || idVal == 0 {
		response.BadRequest(c, "ID thẻ không hợp lệ")
		return
	}
	tagID := uint(idVal)

	err = h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM audio_tags WHERE tag_id = ?", tagID).Error; err != nil {
			return err
		}
		return tx.Delete(&domain.Tag{}, tagID).Error
	})
	if err != nil {
		response.Internal(c, "Lỗi xóa thẻ")
		return
	}
	h.InvalidateCache()
	middleware.RecordAudit(h.db, c, "tag_delete", "tag", fmt.Sprint(tagID), "", "")
	response.OK(c, gin.H{"message": "Đã xóa thẻ"}, nil)
}

func (h *Handler) MergeTags(c *gin.Context) {
	var req struct {
		SourceIDs []uint `json:"sourceIds" binding:"required"`
		TargetID  uint   `json:"targetId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.TargetID == 0 || len(req.SourceIDs) == 0 {
		response.BadRequest(c, "Vui lòng chọn thẻ nguồn và thẻ đích")
		return
	}

	var target domain.Tag
	if err := h.db.First(&target, req.TargetID).Error; err != nil {
		response.NotFound(c, "Không tìm thấy thẻ đích")
		return
	}

	sources := make([]uint, 0, len(req.SourceIDs))
	for _, sid := range req.SourceIDs {
		if sid != 0 && sid != req.TargetID {
			sources = append(sources, sid)
		}
	}
	if len(sources) == 0 {
		response.BadRequest(c, "Thẻ nguồn phải khác thẻ đích")
		return
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		var existingAudioIDs []uint
		tx.Table("audio_tags").Where("tag_id = ?", req.TargetID).Pluck("audio_id", &existingAudioIDs)
		hasTarget := map[uint]bool{}
		for _, aid := range existingAudioIDs {
			hasTarget[aid] = true
		}

		var moveAudioIDs []uint
		tx.Table("audio_tags").Where("tag_id IN ?", sources).Distinct("audio_id").Pluck("audio_id", &moveAudioIDs)
		for _, aid := range moveAudioIDs {
			if !hasTarget[aid] {
				if err := tx.Exec("INSERT INTO audio_tags (audio_id, tag_id) VALUES (?, ?)", aid, req.TargetID).Error; err != nil {
					return err
				}
				hasTarget[aid] = true
			}
		}

		if err := tx.Exec("DELETE FROM audio_tags WHERE tag_id IN ?", sources).Error; err != nil {
			return err
		}
		return tx.Where("id IN ?", sources).Delete(&domain.Tag{}).Error
	})
	if err != nil {
		response.Internal(c, "Không thể gộp thẻ")
		return
	}

	h.InvalidateCache()
	middleware.RecordAudit(h.db, c, "tag_merge", "tag", fmt.Sprint(target.ID), target.Name, fmt.Sprintf("merged=%d", len(sources)))
	response.OK(c, gin.H{"merged": len(sources), "targetId": target.ID}, nil)
}

func (h *Handler) CleanupUnusedTags(c *gin.Context) {
	var usedIDs []uint
	h.db.Table("audio_tags").Distinct("tag_id").Pluck("tag_id", &usedIDs)

	var res *gorm.DB
	if len(usedIDs) == 0 {
		res = h.db.Where("1 = 1").Delete(&domain.Tag{})
	} else {
		res = h.db.Where("id NOT IN ?", usedIDs).Delete(&domain.Tag{})
	}
	if res.Error != nil {
		response.Internal(c, "Không thể dọn thẻ trống")
		return
	}
	h.InvalidateCache()
	middleware.RecordAudit(h.db, c, "tag_cleanup", "tag", "unused", "Dọn thẻ trống", fmt.Sprintf("deleted=%d", res.RowsAffected))
	response.OK(c, gin.H{"deleted": res.RowsAffected}, nil)
}
