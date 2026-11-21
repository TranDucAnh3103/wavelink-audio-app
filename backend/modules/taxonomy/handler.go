package taxonomy

import (
	"strings"
	"sync"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	db          *gorm.DB
	cacheMu     sync.RWMutex
	catCache    []domain.Category
	catExpiry   time.Time
	tagCache    []domain.Tag
	tagExpiry   time.Time
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{db: db}
}

func (h *Handler) invalidateCache() {
	h.cacheMu.Lock()
	defer h.cacheMu.Unlock()
	h.catExpiry = time.Time{}
	h.tagExpiry = time.Time{}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	// Categories
	rg.GET("/categories", h.GetCategories)
	rg.POST("/categories", middleware.RequireAuth(), middleware.RequireAdmin(), h.CreateCategory)
	rg.PUT("/categories/:id", middleware.RequireAuth(), middleware.RequireAdmin(), h.UpdateCategory)
	rg.DELETE("/categories/:id", middleware.RequireAuth(), middleware.RequireAdmin(), h.DeleteCategory)

	// Tags
	rg.GET("/tags", h.GetTags)
	rg.POST("/tags", middleware.RequireAuth(), middleware.RequireAdmin(), h.CreateTag)
	rg.DELETE("/tags/:id", middleware.RequireAuth(), middleware.RequireAdmin(), h.DeleteTag)
}

func (h *Handler) GetCategories(c *gin.Context) {
	h.cacheMu.RLock()
	if time.Now().Before(h.catExpiry) && len(h.catCache) > 0 {
		cached := h.catCache
		h.cacheMu.RUnlock()
		response.OK(c, cached, nil)
		return
	}
	h.cacheMu.RUnlock()

	var categories []domain.Category
	if err := h.db.Order("name ASC").Find(&categories).Error; err != nil {
		response.Internal(c, "Lỗi lấy danh sách thể loại")
		return
	}

	// Tối ưu N+1: Đếm số lượng Audio trong từng category bằng đúng 1 câu GROUP BY
	type catCount struct {
		CategoryID uint
		Total      int
	}
	var counts []catCount
	h.db.Model(&domain.Audio{}).
		Select("category_id, count(*) as total").
		Where("status = ?", domain.StatusActive).
		Group("category_id").
		Scan(&counts)

	countMap := make(map[uint]int)
	for _, cc := range counts {
		countMap[cc.CategoryID] = cc.Total
	}

	for i := range categories {
		categories[i].Count = countMap[categories[i].ID]
	}

	// Cập nhật Cache (TTL 5 phút)
	h.cacheMu.Lock()
	h.catCache = categories
	h.catExpiry = time.Now().Add(5 * time.Minute)
	h.cacheMu.Unlock()

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

	slug := req.Slug
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(req.Name, " ", "-"))
	}
	color := req.Color
	if color == "" {
		color = "primary"
	}

	cat := domain.Category{
		Name:        req.Name,
		Slug:        slug,
		Description: req.Description,
		Color:       color,
	}

	if err := h.db.Create(&cat).Error; err != nil {
		response.BadRequest(c, "Không thể tạo thể loại: trùng tên hoặc slug")
		return
	}

	h.invalidateCache()
	response.Created(c, cat)
}

func (h *Handler) UpdateCategory(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		Color       string `json:"color"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu không hợp lệ")
		return
	}

	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Slug != "" {
		updates["slug"] = req.Slug
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Color != "" {
		updates["color"] = req.Color
	}

	if err := h.db.Model(&domain.Category{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		response.Internal(c, "Lỗi cập nhật thể loại")
		return
	}

	h.invalidateCache()
	var updated domain.Category
	h.db.First(&updated, id)
	response.OK(c, updated, nil)
}

func (h *Handler) DeleteCategory(c *gin.Context) {
	id := c.Param("id")
	if err := h.db.Delete(&domain.Category{}, id).Error; err != nil {
		response.Internal(c, "Lỗi xóa thể loại")
		return
	}
	h.invalidateCache()
	response.OK(c, gin.H{"message": "Đã xóa thể loại"}, nil)
}

func (h *Handler) GetTags(c *gin.Context) {
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

	// Tối ưu N+1: Đếm số lượng Audio có tag bằng đúng 1 câu GROUP BY
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

	// Cập nhật Cache (TTL 5 phút)
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

	slug := req.Slug
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(req.Name, " ", "-"))
	}

	tag := domain.Tag{
		Name: req.Name,
		Slug: slug,
	}

	if err := h.db.Create(&tag).Error; err != nil {
		response.BadRequest(c, "Thẻ đã tồn tại")
		return
	}

	h.invalidateCache()
	response.Created(c, tag)
}

func (h *Handler) DeleteTag(c *gin.Context) {
	id := c.Param("id")
	if err := h.db.Delete(&domain.Tag{}, id).Error; err != nil {
		response.Internal(c, "Lỗi xóa thẻ")
		return
	}
	h.invalidateCache()
	response.OK(c, gin.H{"message": "Đã xóa thẻ"}, nil)
}
