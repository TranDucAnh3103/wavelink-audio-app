package logic

import (
	"time"

	"audio-app-backend/core/domain"
)

const (
	MaxFreeImportsPerDay = 5
)

// IsActiveVIPOrAdmin kiểm tra quyền Admin hoặc VIP đang còn hạn sử dụng
func IsActiveVIPOrAdmin(user domain.User) bool {
	if user.Role == domain.RoleAdmin {
		return true
	}
	if user.Role == domain.RoleVIP || user.Membership == domain.MembershipVIP {
		if user.VipExpiresAt != nil && time.Now().UTC().After(*user.VipExpiresAt) {
			return false
		}
		return true
	}
	return false
}

// CanImportYouTube kiểm tra quyền nhập link YouTube theo cấp bậc người dùng
func CanImportYouTube(user domain.User, todayImportCount int) (bool, string) {
	if IsActiveVIPOrAdmin(user) {
		return true, ""
	}

	if user.IsGuest || user.Role == domain.RoleGuest {
		return false, "Khách vãng lai không thể nhập link. Vui lòng đăng nhập hoặc nâng cấp tài khoản."
	}

	// Tài khoản thường (FREE)
	if todayImportCount >= MaxFreeImportsPerDay {
		return false, "Bạn đã dùng hết lượt nhập link miễn phí hôm nay (5 lượt/ngày). Vui lòng nâng cấp VIP để không giới hạn."
	}

	return true, ""
}

// CanAccessAudio kiểm tra quyền truy cập truyện (Cho phép tất cả người dùng kể cả khách vãng lai vào xem và nghe thử tập 1)
func CanAccessAudio(user domain.User, audio domain.Audio) (bool, string) {
	return true, ""
}

// CanAccessEpisode kiểm tra quyền nghe từng tập audio (tập 1..freeCount miễn phí nghe thử, các tập sau khóa nếu là VIP)
func CanAccessEpisode(user domain.User, audio domain.Audio, episode domain.Episode) (bool, string) {
	if !audio.IsVIPOnly && !episode.IsVIP {
		return true, ""
	}

	if IsActiveVIPOrAdmin(user) {
		return true, ""
	}

	// Số tập miễn phí nghe thử (mặc định là 1 nếu nil, nếu set = 0 thì khóa toàn bộ)
	freeCount := 1
	if audio.FreeEpisodesCount != nil {
		freeCount = *audio.FreeEpisodesCount
	}

	// Nếu tập nằm trong số tập cho phép nghe thử miễn phí
	if freeCount > 0 && episode.EpisodeNumber <= freeCount {
		return true, ""
	}

	// Các tập VIP yêu cầu tài khoản thành viên
	if user.IsGuest || user.Role == domain.RoleGuest || user.ID == 0 {
		return false, "Tập VIP chỉ dành cho thành viên. Vui lòng đăng nhập để tiếp tục nghe."
	}

	return false, "Tập VIP chỉ dành riêng cho thành viên VIP. Vui lòng nâng cấp gói để tiếp tục nghe."
}

// CanManageContent kiểm tra quyền chỉnh sửa audio, tập, phân mục
func CanManageContent(user domain.User) bool {
	return user.Role == domain.RoleAdmin
}

// CanManageUsers kiểm tra quyền phân hạng tài khoản, cấp VIP
func CanManageUsers(user domain.User) bool {
	return user.Role == domain.RoleAdmin
}
