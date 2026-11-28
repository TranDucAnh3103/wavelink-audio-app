package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"audio-app-backend/core/domain"
)

// RecordAudit ghi nhật ký thao tác quản trị vào bảng admin_audit_logs.
func RecordAudit(db *gorm.DB, c *gin.Context, action, targetType, targetID, targetName, detail string) {
	if db == nil {
		return
	}

	var adminID uint
	var adminName string
	if c != nil {
		adminID = GetCurrentUserID(c)
		if v, exists := c.Get("username"); exists {
			if name, ok := v.(string); ok {
				adminName = name
			}
		}
	}
	if adminName == "" {
		adminName = "admin"
	}

	_ = db.Create(&domain.AdminAuditLog{
		AdminID:    adminID,
		AdminName:  adminName,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		TargetName: targetName,
		Detail:     detail,
		CreatedAt:  time.Now().UTC(),
	}).Error
}
