package middleware

import "sync"

var bannedUsers sync.Map

// SetBanned đánh dấu (hoặc gỡ) tài khoản bị khóa trong bộ nhớ để chặn phiên đăng nhập ngay lập tức.
func SetBanned(userID uint, banned bool) {
	if userID == 0 {
		return
	}
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
