package middleware

import (
	"sync"
	"time"

	"gorm.io/gorm"
	"audio-app-backend/core/domain"
)

const liveAuthCacheTTL = 30 * time.Second

type liveUserAuthEntry struct {
	role       string
	membership string
	isBanned   bool
	deleted    bool
	cachedAt   time.Time
}

var (
	bannedUsers   sync.Map
	authDBMu      sync.RWMutex
	authDB        *gorm.DB
	liveUserCache sync.Map
)

// SetAuthDB gắn kết nối DB để middleware xác thực đồng bộ quyền/trạng thái khóa mới nhất từ DB.
func SetAuthDB(db *gorm.DB) {
	authDBMu.Lock()
	authDB = db
	authDBMu.Unlock()
	liveUserCache.Range(func(key, _ any) bool {
		liveUserCache.Delete(key)
		return true
	})
}

// InvalidateUserAuth xóa cache quyền/trạng thái khóa của user để thay đổi có hiệu lực ngay lập tức.
func InvalidateUserAuth(userID uint) {
	if userID == 0 {
		return
	}
	liveUserCache.Delete(userID)
}

// ResolveLiveUserAuth đọc quyền, gói thành viên và trạng thái khóa mới nhất (cache TTL 30 giây).
func ResolveLiveUserAuth(userID uint) (role, membership string, isBanned, deleted, ok bool) {
	if userID == 0 {
		return "", "", false, false, false
	}

	if v, exists := liveUserCache.Load(userID); exists {
		entry := v.(liveUserAuthEntry)
		if time.Since(entry.cachedAt) < liveAuthCacheTTL {
			return entry.role, entry.membership, entry.isBanned, entry.deleted, true
		}
	}

	authDBMu.RLock()
	db := authDB
	authDBMu.RUnlock()
	if db == nil {
		return "", "", false, false, false
	}

	var u struct {
		Role         string
		Membership   string
		IsBanned     bool
		VipExpiresAt *time.Time
	}
	err := db.Model(&domain.User{}).
		Select("role, membership, is_banned, vip_expires_at").
		Where("id = ?", userID).
		Take(&u).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			liveUserCache.Store(userID, liveUserAuthEntry{
				deleted:  true,
				cachedAt: time.Now(),
			})
			return "", "", false, true, true
		}
		return "", "", false, false, false
	}

	resolvedRole := u.Role
	resolvedMembership := u.Membership
	if resolvedRole == domain.RoleVIP && u.VipExpiresAt != nil && u.VipExpiresAt.Before(time.Now()) {
		resolvedRole = domain.RoleUser
		resolvedMembership = domain.MembershipFree
	}

	if u.IsBanned {
		bannedUsers.Store(userID, struct{}{})
	} else {
		bannedUsers.Delete(userID)
	}

	liveUserCache.Store(userID, liveUserAuthEntry{
		role:       resolvedRole,
		membership: resolvedMembership,
		isBanned:   u.IsBanned,
		deleted:    false,
		cachedAt:   time.Now(),
	})

	return resolvedRole, resolvedMembership, u.IsBanned, false, true
}

// SetBanned đánh dấu (hoặc gỡ) tài khoản bị khóa trong bộ nhớ để chặn phiên đăng nhập ngay lập tức.
func SetBanned(userID uint, banned bool) {
	if userID == 0 {
		return
	}
	InvalidateUserAuth(userID)
	if banned {
		bannedUsers.Store(userID, struct{}{})
		return
	}
	bannedUsers.Delete(userID)
}

// IsBanned cho biết tài khoản có đang bị khóa hay không.
func IsBanned(userID uint) bool {
	_, ok := bannedUsers.Load(userID)
	return ok
}
