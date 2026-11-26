package middleware

import (
	"errors"
	"strings"
	"time"

	"audio-app-backend/core/domain"
	"audio-app-backend/server/response"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type JWTClaims struct {
	UserID     uint   `json:"userId"`
	Username   string `json:"username"`
	Role       string `json:"role"`
	Membership string `json:"membership"`
	IsGuest    bool   `json:"isGuest"`
	jwt.RegisteredClaims
}

// GenerateToken cấp JWT có thời hạn 30 ngày cho User hoặc Guest
func GenerateToken(user domain.User, secret string) (string, error) {
	claims := JWTClaims{
		UserID:     user.ID,
		Username:   user.Username,
		Role:       user.Role,
		Membership: user.Membership,
		IsGuest:    user.IsGuest,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.Username,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// SessionMiddleware trích xuất thông tin người dùng từ Bearer Token nếu có (Optional Auth)
func SessionMiddleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenString := ""
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
				tokenString = parts[1]
			}
		} else if queryToken := c.Query("token"); queryToken != "" {
			tokenString = queryToken
		}

		if tokenString == "" {
			c.Next()
			return
		}
		claims := &JWTClaims{}

		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return []byte(secret), nil
		})

		if err == nil && token.Valid {
			if IsBanned(claims.UserID) {
				c.Next()
				return
			}
			c.Set("userID", claims.UserID)
			c.Set("username", claims.Username)
			c.Set("userRole", claims.Role)
			c.Set("userMembership", claims.Membership)
			c.Set("isGuest", claims.IsGuest)
		}

		c.Next()
	}
}

// RequireAuth yêu cầu phải có phiên đăng nhập (kể cả Guest)
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		_, exists := c.Get("userID")
		if !exists {
			response.Unauthorized(c, "Vui lòng đăng nhập để thực hiện thao tác này")
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireAdmin yêu cầu quyền Quản trị viên
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("userRole")
		roleStr := ""
		if exists && role != nil {
			if s, ok := role.(string); ok {
				roleStr = strings.ToUpper(strings.TrimSpace(s))
			}
		}

		if roleStr != domain.RoleAdmin {
			response.Forbidden(c, "Bạn không có quyền quản trị viên (Admin)")
			c.Abort()
			return
		}
		c.Next()
	}
}

// GetCurrentUserID lấy UserID từ Context an toàn
func GetCurrentUserID(c *gin.Context) uint {
	if val, ok := c.Get("userID"); ok {
		if id, ok := val.(uint); ok {
			return id
		}
	}
	return 0
}

// GetCurrentUserRole lấy Role từ Context
func GetCurrentUserRole(c *gin.Context) string {
	if val, ok := c.Get("userRole"); ok {
		if role, ok := val.(string); ok {
			return role
		}
	}
	return domain.RoleGuest
}

// GetCurrentUserMembership lấy Membership từ Context
func GetCurrentUserMembership(c *gin.Context) string {
	if val, ok := c.Get("userMembership"); ok {
		if mem, ok := val.(string); ok {
			return mem
		}
	}
	return domain.MembershipFree
}
