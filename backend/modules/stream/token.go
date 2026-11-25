package stream

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrInvalidStreamToken = errors.New("invalid stream token")
	ErrExpiredStreamToken = errors.New("expired stream token")
)

// StreamTokenClaims represents the signed payload authorizing access to stream a single YouTube video.
type StreamTokenClaims struct {
	VideoID  string `json:"v"`
	AudioID  uint   `json:"a"`
	UserID   uint   `json:"u,omitempty"`
	GuestKey string `json:"g,omitempty"`
	Exp      int64  `json:"exp"`
}

// TokenManager generates and verifies short-lived HMAC-SHA256 stream tokens.
type TokenManager struct {
	secret []byte
}

func NewTokenManager(secret string) *TokenManager {
	if strings.TrimSpace(secret) == "" {
		secret = "wavelink-stream-dev-secret"
	}
	return &TokenManager{secret: []byte(secret)}
}

func (tm *TokenManager) Generate(videoID string, audioID, userID uint, guestKey string, ttl time.Duration) (string, time.Time, error) {
	if strings.TrimSpace(videoID) == "" {
		return "", time.Time{}, errors.New("videoID required")
	}
	if ttl <= 0 {
		ttl = 6 * time.Hour
	}
	expiresAt := time.Now().UTC().Add(ttl)
	claims := StreamTokenClaims{
		VideoID:  videoID,
		AudioID:  audioID,
		UserID:   userID,
		GuestKey: guestKey,
		Exp:      expiresAt.Unix(),
	}
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", time.Time{}, err
	}
	payloadEnc := base64.RawURLEncoding.EncodeToString(payloadBytes)
	sig := tm.sign(payloadEnc)
	return payloadEnc + "." + sig, expiresAt, nil
}

func (tm *TokenManager) Verify(tokenStr, expectedVideoID string) (*StreamTokenClaims, error) {
	if strings.TrimSpace(tokenStr) == "" {
		return nil, ErrInvalidStreamToken
	}
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 2 {
		return nil, ErrInvalidStreamToken
	}
	payloadEnc, sigEnc := parts[0], parts[1]
	expectedSig := tm.sign(payloadEnc)
	if !hmac.Equal([]byte(sigEnc), []byte(expectedSig)) {
		return nil, ErrInvalidStreamToken
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadEnc)
	if err != nil {
		return nil, ErrInvalidStreamToken
	}

	var claims StreamTokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, ErrInvalidStreamToken
	}
	if expectedVideoID != "" && claims.VideoID != expectedVideoID {
		return nil, ErrInvalidStreamToken
	}
	if time.Now().UTC().Unix() >= claims.Exp {
		return nil, ErrExpiredStreamToken
	}
	return &claims, nil
}

func (tm *TokenManager) sign(payload string) string {
	mac := hmac.New(sha256.New, tm.secret)
	_, _ = mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (c *StreamTokenClaims) SubjectKey() string {
	if c.UserID > 0 {
		return fmt.Sprintf("u:%d", c.UserID)
	}
	if c.GuestKey != "" {
		return "g:" + c.GuestKey
	}
	return "g:anon"
}
