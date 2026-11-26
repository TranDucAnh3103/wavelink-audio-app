package auth

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/middleware"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Handler struct {
	db        *gorm.DB
	jwtSecret string
}

func NewHandler(db *gorm.DB, jwtSecret string) *Handler {
	return &Handler{db: db, jwtSecret: jwtSecret}
}

type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email"`
	Password string `json:"password" binding:"required,min=6"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type GoogleLoginRequest struct {
	Credential  string `json:"credential"`
	AccessToken string `json:"accessToken"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	Picture     string `json:"picture"`
	GoogleID    string `json:"googleId"`
}

type GoogleTokenInfo struct {
	Sub           string      `json:"sub"`
	UserID        string      `json:"user_id"`
	Email         string      `json:"email"`
	EmailVerified interface{} `json:"email_verified"`
	Name          string      `json:"name"`
	Picture       string      `json:"picture"`
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	auth := rg.Group("/auth")
	{
		auth.POST("/guest", h.GuestLogin)
		auth.POST("/register", h.Register)
		auth.POST("/login", h.Login)
		auth.POST("/google", h.GoogleLogin)
		auth.GET("/me", middleware.RequireAuth(), h.GetMe)
		auth.POST("/logout", h.Logout)
	}
}

func (h *Handler) GuestLogin(c *gin.Context) {
	// Khách vãng lai (GUEST) không còn lưu tài khoản vào cơ sở dữ liệu nữa
	// để tối ưu dung lượng DB, tránh phình to bảng users không cần thiết.
	guest := domain.User{
		ID:         0,
		Username:   "Khách vãng lai",
		Email:      "",
		IsGuest:    true,
		Role:       domain.RoleGuest,
		Membership: domain.MembershipFree,
	}

	response.OK(c, gin.H{
		"token": "",
		"user":  guest,
	}, nil)
}

func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu đăng ký không hợp lệ: "+err.Error())
		return
	}

	var exists domain.User
	if err := h.db.Where("username = ?", req.Username).First(&exists).Error; err == nil {
		response.BadRequest(c, "Tên tài khoản đã tồn tại")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		response.Internal(c, "Lỗi mã hóa mật khẩu")
		return
	}

	email := strings.TrimSpace(req.Email)
	if email == "" {
		trimmedUser := strings.TrimSpace(req.Username)
		if strings.Count(trimmedUser, "@") == 1 && strings.Contains(strings.Split(trimmedUser, "@")[1], ".") {
			email = trimmedUser
		} else {
			safeUser := strings.ReplaceAll(trimmedUser, "@", "_")
			email = fmt.Sprintf("%s_%s@user.local", safeUser, uuid.New().String()[:6])
		}
	}

	newUser := domain.User{
		Username:     req.Username,
		Email:        email,
		PasswordHash: string(hash),
		Role:         domain.RoleUser,
		Membership:   domain.MembershipFree,
		IsGuest:      false,
	}

	if err := h.db.Create(&newUser).Error; err != nil {
		response.Internal(c, "Không thể tạo tài khoản: "+err.Error())
		return
	}

	token, err := middleware.GenerateToken(newUser, h.jwtSecret)
	if err != nil {
		response.Internal(c, "Lỗi cấp token")
		return
	}

	response.Created(c, gin.H{
		"token": token,
		"user":  newUser,
	})
}

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Vui lòng nhập tên tài khoản và mật khẩu")
		return
	}

	var user domain.User
	if err := h.db.Where("username = ? OR email = ?", req.Username, req.Username).First(&user).Error; err != nil {
		response.Error(c, http.StatusUnauthorized, "AUTH_FAILED", "Tên tài khoản hoặc mật khẩu không đúng")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		response.Error(c, http.StatusUnauthorized, "AUTH_FAILED", "Tên tài khoản hoặc mật khẩu không đúng")
		return
	}

	if user.IsBanned {
		response.Forbidden(c, "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.")
		return
	}
	h.touchLastLogin(&user)

	token, err := middleware.GenerateToken(user, h.jwtSecret)
	if err != nil {
		response.Internal(c, "Lỗi cấp token đăng nhập")
		return
	}

	response.OK(c, gin.H{
		"token": token,
		"user":  user,
	}, nil)
}

func (h *Handler) touchLastLogin(user *domain.User) {
	now := time.Now().UTC()
	user.LastLoginAt = &now
	h.db.Model(&domain.User{}).Where("id = ?", user.ID).UpdateColumn("last_login_at", now)
}

func (h *Handler) GetMe(c *gin.Context) {
	userID := middleware.GetCurrentUserID(c)
	var user domain.User
	if err := h.db.First(&user, userID).Error; err != nil {
		response.NotFound(c, "Không tìm thấy thông tin người dùng")
		return
	}

	// Kiểm tra nếu hạn VIP đã hết
	if user.Role == domain.RoleVIP && user.VipExpiresAt != nil && user.VipExpiresAt.Before(time.Now()) {
		user.Role = domain.RoleUser
		user.Membership = domain.MembershipFree
		user.VipExpiresAt = nil
		h.db.Model(&user).Updates(map[string]interface{}{
			"role":           domain.RoleUser,
			"membership":     domain.MembershipFree,
			"vip_expires_at": nil,
		})
	}

	response.OK(c, user, nil)
}

func (h *Handler) Logout(c *gin.Context) {
	response.OK(c, gin.H{"message": "Đăng xuất thành công"}, nil)
}

func (h *Handler) GoogleLogin(c *gin.Context) {
	var req GoogleLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Dữ liệu đăng nhập Google không hợp lệ")
		return
	}

	req.Credential = strings.TrimSpace(req.Credential)
	req.AccessToken = strings.TrimSpace(req.AccessToken)
	if req.Credential == "" && req.AccessToken == "" {
		response.Unauthorized(c, "Thiếu mã xác thực Google (credential hoặc accessToken)")
		return
	}

	var email, name, picture, googleID string
	verified := false

	// 1. Xác thực ID Token (Credential) trực tiếp với Google TokenInfo API (không fallback tự decode JWT chưa xác minh)
	if req.Credential != "" {
		client := &http.Client{Timeout: 6 * time.Second}
		resp, err := client.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(req.Credential))
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var info GoogleTokenInfo
			if err := json.NewDecoder(resp.Body).Decode(&info); err == nil && (info.Sub != "" || info.Email != "") {
				email = strings.TrimSpace(info.Email)
				name = strings.TrimSpace(info.Name)
				picture = strings.TrimSpace(info.Picture)
				googleID = strings.TrimSpace(info.Sub)
				verified = true
			}
		} else if resp != nil {
			resp.Body.Close()
		}
	}

	// 2. Xác thực qua Google AccessToken (UserInfo API + fallback TokenInfo API)
	if !verified && req.AccessToken != "" {
		client := &http.Client{Timeout: 6 * time.Second}
		uReq, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v3/userinfo", nil)
		uReq.Header.Set("Authorization", "Bearer "+req.AccessToken)
		if resp, err := client.Do(uReq); err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var info GoogleTokenInfo
			if err := json.NewDecoder(resp.Body).Decode(&info); err == nil && (info.Sub != "" || info.UserID != "" || info.Email != "") {
				email = strings.TrimSpace(info.Email)
				name = strings.TrimSpace(info.Name)
				picture = strings.TrimSpace(info.Picture)
				googleID = strings.TrimSpace(info.Sub)
				if googleID == "" {
					googleID = strings.TrimSpace(info.UserID)
				}
				verified = true
			}
		} else if resp != nil {
			resp.Body.Close()
		}

		if !verified {
			if resp, err := client.Get("https://oauth2.googleapis.com/tokeninfo?access_token=" + url.QueryEscape(req.AccessToken)); err == nil && resp.StatusCode == http.StatusOK {
				defer resp.Body.Close()
				var info GoogleTokenInfo
				if err := json.NewDecoder(resp.Body).Decode(&info); err == nil && (info.Sub != "" || info.UserID != "" || info.Email != "") {
					email = strings.TrimSpace(info.Email)
					if name == "" {
						name = strings.TrimSpace(info.Name)
					}
					if picture == "" {
						picture = strings.TrimSpace(info.Picture)
					}
					googleID = strings.TrimSpace(info.Sub)
					if googleID == "" {
						googleID = strings.TrimSpace(info.UserID)
					}
					verified = true
				}
			} else if resp != nil {
				resp.Body.Close()
			}
		}
	}

	if !verified || (email == "" && googleID == "") {
		response.Unauthorized(c, "Xác thực tài khoản Google thất bại hoặc token đã hết hạn")
		return
	}

	if name == "" {
		if req.Name != "" {
			name = strings.TrimSpace(req.Name)
		} else if email != "" {
			parts := strings.Split(email, "@")
			name = parts[0]
		} else {
			name = "Google User"
		}
	}
	if picture == "" && req.Picture != "" {
		picture = strings.TrimSpace(req.Picture)
	}

	// 3. Tìm hoặc Tạo User trong Database
	var user domain.User
	found := false

	if googleID != "" {
		if err := h.db.Where("google_id = ?", googleID).First(&user).Error; err == nil {
			found = true
		}
	}

	if !found && email != "" {
		if err := h.db.Where("email = ? OR username = ?", email, email).First(&user).Error; err == nil {
			found = true
		}
	}

	if found {
		// Cập nhật thông tin mới nhất từ Google
		updates := map[string]interface{}{
			"is_guest": false,
		}
		if picture != "" {
			updates["avatar_url"] = picture
			user.AvatarURL = picture
		}
		if googleID != "" && user.GoogleID == "" {
			updates["google_id"] = googleID
			user.GoogleID = googleID
		}
		if email != "" && (user.Email == "" || strings.HasSuffix(strings.ToLower(user.Email), "@user.local")) {
			updates["email"] = email
			user.Email = email
		}
		if user.Role == domain.RoleGuest {
			updates["role"] = domain.RoleUser
			user.Role = domain.RoleUser
		}
		h.db.Model(&user).Updates(updates)
	} else {
		// Tạo tài khoản người dùng WaveLink mới từ Google
		candidateUsername := name
		var exists domain.User
		if err := h.db.Where("username = ?", candidateUsername).First(&exists).Error; err == nil {
			candidateUsername = fmt.Sprintf("%s_%s", candidateUsername, uuid.New().String()[:4])
		}

		user = domain.User{
			Username:   candidateUsername,
			Email:      email,
			AvatarURL:  picture,
			GoogleID:   googleID,
			Role:       domain.RoleUser,
			Membership: domain.MembershipFree,
			IsGuest:    false,
		}

		if err := h.db.Create(&user).Error; err != nil {
			response.Internal(c, "Không thể tạo tài khoản từ Google: "+err.Error())
			return
		}
	}

	if user.IsBanned {
		response.Forbidden(c, "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.")
		return
	}
	h.touchLastLogin(&user)

	// 4. Sinh JWT Token WaveLink
	token, err := middleware.GenerateToken(user, h.jwtSecret)
	if err != nil {
		response.Internal(c, "Lỗi cấp token xác thực")
		return
	}

	response.OK(c, gin.H{
		"token": token,
		"user":  user,
	}, nil)
}
