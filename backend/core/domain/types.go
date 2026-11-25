package domain

import (
	"time"
)

// User Roles & Memberships
const (
	RoleGuest = "GUEST"
	RoleUser  = "USER"
	RoleVIP   = "VIP"
	RoleAdmin = "ADMIN"

	MembershipFree = "FREE"
	MembershipVIP  = "VIP"

	StatusActive  = "ACTIVE"
	StatusHidden  = "HIDDEN"
	StatusDeleted = "DELETED"

	StreamStatusUnknown = "UNKNOWN"
	StreamStatusOK      = "OK"
	StreamStatusFailed  = "FAILED"
)

// User Entity
type User struct {
	ID           uint       `json:"id" gorm:"primaryKey"`
	Username     string     `json:"username" gorm:"size:100;uniqueIndex;not null"`
	Email        string     `json:"email" gorm:"size:100;uniqueIndex"`
	PasswordHash string     `json:"-" gorm:"size:255"`
	AvatarURL    string     `json:"avatarUrl" gorm:"size:500;column:avatar_url"`
	CoverURL     string     `json:"coverUrl,omitempty" gorm:"size:500;column:cover_url"`
	GoogleID     string     `json:"googleId,omitempty" gorm:"size:100;column:google_id;index"`
	IsGuest      bool       `json:"isGuest" gorm:"default:false;not null"`
	Role         string     `json:"role" gorm:"size:20;default:'USER';not null"`
	Membership   string     `json:"membership" gorm:"size:20;default:'FREE';not null"`
	VipExpiresAt *time.Time `json:"vipExpiresAt,omitempty" gorm:"column:vip_expires_at"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

// Category Entity
type Category struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name" gorm:"size:100;uniqueIndex;not null"`
	Slug        string    `json:"slug" gorm:"size:100;uniqueIndex;not null"`
	Description string    `json:"description" gorm:"size:255"`
	Color       string    `json:"color" gorm:"size:50;default:'primary'"`
	Count       int       `json:"count" gorm:"-"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Tag Entity
type Tag struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Name      string    `json:"name" gorm:"size:50;uniqueIndex;not null"`
	Slug      string    `json:"slug" gorm:"size:50;uniqueIndex;not null"`
	Count     int       `json:"count" gorm:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

// Audio Entity (YouTube Video)
type Audio struct {
	ID                   uint           `json:"id" gorm:"primaryKey"`
	YoutubeVideoID       string         `json:"youtubeVideoId" gorm:"column:youtube_video_id;size:20;uniqueIndex;not null"`
	YoutubeURL           string         `json:"youtubeUrl" gorm:"column:youtube_url;size:500;not null"`
	Title                string         `json:"title" gorm:"size:255;not null;index"`
	Description          string         `json:"description" gorm:"type:text"`
	Author               string         `json:"author" gorm:"column:author_name;size:150"`
	ChannelID            string         `json:"channelId" gorm:"column:channel_id;size:100"`
	ThumbnailURL         string         `json:"thumbnailUrl" gorm:"column:thumbnail_url;size:500"`
	TotalDurationSeconds int            `json:"totalDurationSeconds" gorm:"column:duration_seconds;default:0;not null"`
	CategoryID           uint           `json:"categoryId" gorm:"column:category_id;index"`
	Category             *Category      `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	Status               string         `json:"status" gorm:"size:20;default:'ACTIVE';index"`
	StreamStatus         string         `json:"streamStatus" gorm:"column:stream_status;size:20;default:'UNKNOWN';index"`
	StreamCheckedAt      *time.Time     `json:"streamCheckedAt,omitempty" gorm:"column:stream_checked_at"`
	AudioMime            string         `json:"audioMime,omitempty" gorm:"column:audio_mime;size:100"`
	IsVIPOnly            bool           `json:"isVipOnly" gorm:"column:is_vip_only;default:false"`
	FreeEpisodesCount    *int           `json:"freeEpisodesCount" gorm:"column:free_episodes_count;default:1"`
	CreatedBy            uint           `json:"createdBy" gorm:"column:created_by;index;default:0"`
	CreatedAt            time.Time      `json:"createdAt"`
	UpdatedAt            time.Time      `json:"updatedAt"`
	
	// Relations
	Tags     []Tag     `json:"-" gorm:"many2many:audio_tags;constraint:OnDelete:CASCADE;"`
	Episodes []Episode `json:"episodes,omitempty" gorm:"foreignKey:AudioID;constraint:OnDelete:CASCADE;"`

	// Computed / Enriched Fields for API & Frontend
	TagNames             []string `json:"tags" gorm:"-"`
	CategoryName         string   `json:"categoryName" gorm:"-"`
	TotalEpisodes        int      `json:"totalEpisodes" gorm:"-"`
	FormattedDuration    string   `json:"formattedDuration" gorm:"-"`
	IsFavorite           bool     `json:"isFavorite" gorm:"-"`
	LastPositionSeconds  int      `json:"lastPositionSeconds" gorm:"-"`
	ProgressPercent      float64  `json:"progressPercent" gorm:"-"`
	FormattedPosition    string   `json:"formattedPosition" gorm:"-"`
	CurrentEpisodeID     uint     `json:"currentEpisodeId" gorm:"-"`
	CurrentEpisodeNumber int      `json:"currentEpisodeNumber" gorm:"-"`
	CurrentEpisodeTitle  string   `json:"currentEpisodeTitle" gorm:"-"`
	ViewCount            int64    `json:"viewCount" gorm:"-"`
}

// Episode Entity (Logical segment)
type Episode struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	AudioID         uint      `json:"audioId" gorm:"column:audio_id;not null;uniqueIndex:uk_audio_ep"`
	EpisodeNumber   int       `json:"episodeNumber" gorm:"column:episode_number;not null;uniqueIndex:uk_audio_ep"`
	Title           string    `json:"title" gorm:"size:200;not null"`
	StartSeconds    int       `json:"startSeconds" gorm:"column:start_seconds;default:0;not null"`
	EndSeconds      int       `json:"endSeconds" gorm:"column:end_seconds;not null"`
	DurationSeconds int       `json:"duration" gorm:"column:duration_seconds;not null"`
	IsVIP           bool      `json:"isVip" gorm:"column:is_vip;default:false"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`

	// Enriched for User
	Completed       bool    `json:"completed" gorm:"-"`
	ProgressPercent float64 `json:"progressPercent" gorm:"-"`
	PositionSeconds int     `json:"positionSeconds" gorm:"-"`
	IsLocked        bool    `json:"isLocked" gorm:"-"`
}

// ListeningProgress Entity (UPSERT 60s)
type ListeningProgress struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	UserID          uint      `json:"userId" gorm:"column:user_id;not null;uniqueIndex:uk_user_ep"`
	AudioID         uint      `json:"audioId" gorm:"column:audio_id;not null;index"`
	EpisodeID       uint      `json:"episodeId" gorm:"column:episode_id;not null;uniqueIndex:uk_user_ep"`
	PositionSeconds int       `json:"positionSeconds" gorm:"column:position_seconds;default:0;not null"`
	DurationSeconds int       `json:"durationSeconds" gorm:"column:duration_seconds;default:0;not null"`
	ProgressPercent float64   `json:"progressPercent" gorm:"column:progress_percent;type:decimal(5,2);default:0.00;index;not null"`
	Completed       bool      `json:"completed" gorm:"default:false;index;not null"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// ListeningHistory Entity (Append-only)
type ListeningHistory struct {
	ID               uint      `json:"id" gorm:"primaryKey"`
	UserID           uint      `json:"userId" gorm:"column:user_id;not null;index"`
	AudioID          uint      `json:"audioId" gorm:"column:audio_id;not null;index"`
	Audio            *Audio    `json:"audio,omitempty" gorm:"foreignKey:AudioID"`
	EpisodeID        uint      `json:"episodeId" gorm:"column:episode_id;not null"`
	Episode          *Episode  `json:"episode,omitempty" gorm:"foreignKey:EpisodeID"`
	DurationListened int       `json:"durationListened" gorm:"column:duration_listened;not null"`
	StartedAt        time.Time `json:"startedAt" gorm:"column:started_at"`
	CreatedAt        time.Time `json:"createdAt" gorm:"column:created_at;index"`
}

// Favorite Entity
type Favorite struct {
	UserID    uint      `json:"userId" gorm:"primaryKey;column:user_id"`
	AudioID   uint      `json:"audioId" gorm:"primaryKey;column:audio_id"`
	CreatedAt time.Time `json:"createdAt"`
}

// Notification Entity
type Notification struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"userId" gorm:"column:user_id;index;not null"`
	Title     string    `json:"title" gorm:"size:200;not null"`
	Message   string    `json:"message" gorm:"type:text;not null"`
	Type      string    `json:"type" gorm:"size:50;default:'SYSTEM'"` // SYSTEM, NOVEL_UPDATE, VIP, PROMOTION
	Link      string    `json:"link" gorm:"size:255"`
	IsRead    bool      `json:"isRead" gorm:"default:false;index"`
	CreatedAt time.Time `json:"createdAt"`
}

// NotificationPreference Entity
type NotificationPreference struct {
	UserID          uint      `json:"userId" gorm:"primaryKey;column:user_id"`
	SystemAlerts    bool      `json:"systemAlerts" gorm:"default:true"`
	NovelUpdates    bool      `json:"novelUpdates" gorm:"default:true"`
	PromotionAlerts bool      `json:"promotionAlerts" gorm:"default:true"`
	ExternalAudio   bool      `json:"externalAudio" gorm:"default:true"`
	BlockAll        bool      `json:"blockAll" gorm:"default:false"`
	WelcomeSeeded   bool      `json:"welcomeSeeded" gorm:"default:false"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// MembershipOrder Entity (PayOS v2 QR payment)
type MembershipOrder struct {
	ID              uint       `json:"id" gorm:"primaryKey"`
	OrderCode       string     `json:"orderCode" gorm:"column:order_code;size:50;uniqueIndex;not null"`
	PayOSOrderCode  int64      `json:"payosOrderCode,omitempty" gorm:"column:payos_order_code;index"`
	PaymentLinkID   string     `json:"paymentLinkId,omitempty" gorm:"column:payment_link_id;size:120"`
	CheckoutURL     string     `json:"checkoutUrl,omitempty" gorm:"column:checkout_url;size:500"`
	QRCodeData      string     `json:"qrCode,omitempty" gorm:"column:qr_code_data;type:text"`
	Provider        string     `json:"provider" gorm:"column:provider;size:30;default:'PAYOS'"`
	BankBIN         string     `json:"bankBin,omitempty" gorm:"column:bank_bin;size:20"`
	AccountNumber   string     `json:"accountNumber,omitempty" gorm:"column:account_number;size:50"`
	AccountName     string     `json:"accountName,omitempty" gorm:"column:account_name;size:120"`
	TransferContent string     `json:"transferContent,omitempty" gorm:"column:transfer_content;size:100"`
	UserID          uint       `json:"userId" gorm:"column:user_id;index;not null"`
	PackageID       string     `json:"packageId" gorm:"column:package_id;size:30;not null"`
	PackageName     string     `json:"packageName" gorm:"column:package_name;size:100;not null"`
	Amount          int        `json:"amount" gorm:"column:amount;not null"`
	DurationDays    int        `json:"durationDays" gorm:"column:duration_days;not null"`
	Status          string     `json:"status" gorm:"size:30;default:'PENDING';index"` // PENDING, PAID, CANCELLED, EXPIRED
	QRCodeURL       string     `json:"qrCodeUrl" gorm:"column:qr_code_url;size:500"`
	ExpiresAt       time.Time  `json:"expiresAt" gorm:"column:expires_at;not null"`
	PaidAt          *time.Time `json:"paidAt" gorm:"column:paid_at"`
	CreatedAt       time.Time  `json:"createdAt"`
}

// SystemSetting Entity for persistent runtime settings (Bank info, dynamic VIP packages)
type SystemSetting struct {
	Key       string    `json:"key" gorm:"primaryKey;column:key;size:100"`
	Value     string    `json:"value" gorm:"column:value;type:text"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// CommunityMessage Entity for realtime chat & shared audio recommendations
type CommunityMessage struct {
	ID            uint      `json:"id" gorm:"primaryKey"`
	UserID        uint      `json:"userId" gorm:"column:user_id;index;not null"`
	Username      string    `json:"username" gorm:"size:100;not null"`
	AvatarURL     string    `json:"avatarUrl" gorm:"size:500;column:avatar_url"`
	IsVIP         bool      `json:"isVip" gorm:"column:is_vip;default:false"`
	Role          string    `json:"role" gorm:"size:20;default:'USER'"`
	Message       string    `json:"message" gorm:"type:text;not null"`
	SharedAudioID *uint     `json:"sharedAudioId,omitempty" gorm:"column:shared_audio_id;index"`
	SharedAudio   *Audio    `json:"sharedAudio,omitempty" gorm:"foreignKey:SharedAudioID"`
	CreatedAt     time.Time `json:"createdAt" gorm:"index"`
}

// Leaderboard DTOs
type TopListener struct {
	Rank           int     `json:"rank"`
	UserID         uint    `json:"userId"`
	Username       string  `json:"username"`
	AvatarURL      string  `json:"avatarUrl"`
	TotalSeconds   int64   `json:"totalSeconds"`
	TotalHours     float64 `json:"totalHours"`
	IsVIP          bool    `json:"isVip"`
	Role           string  `json:"role"`
	Membership     string  `json:"membership"`
	LastAudioTitle string  `json:"lastAudioTitle,omitempty"`
}

type VipRankingMember struct {
	Rank         int        `json:"rank"`
	UserID       uint       `json:"userId"`
	Username     string     `json:"username"`
	AvatarURL    string     `json:"avatarUrl"`
	Role         string     `json:"role"`
	Membership   string     `json:"membership"`
	VipExpiresAt *time.Time `json:"vipExpiresAt,omitempty"`
	VipBadge     string     `json:"vipBadge"`
	TotalHours   float64    `json:"totalHours"`
	JoinedAt     time.Time  `json:"joinedAt"`
}

// TableName overrides for GORM to match DDL specs
func (User) TableName() string                   { return "users" }
func (Category) TableName() string               { return "categories" }
func (Tag) TableName() string                    { return "tags" }
func (Audio) TableName() string                  { return "youtube_videos" }
func (Episode) TableName() string                { return "episodes" }
func (ListeningProgress) TableName() string      { return "listening_progress" }
func (ListeningHistory) TableName() string       { return "listening_history" }
func (Favorite) TableName() string               { return "favorites" }
func (Notification) TableName() string           { return "notifications" }
func (NotificationPreference) TableName() string { return "notification_preferences" }
func (MembershipOrder) TableName() string        { return "membership_orders" }
func (SystemSetting) TableName() string          { return "system_settings" }
func (CommunityMessage) TableName() string       { return "community_messages" }

// Consolidated History Item for Profile
type ConsolidatedHistoryItem struct {
	AudioID               uint      `json:"audioId"`
	Title                 string    `json:"title"`
	Author                string    `json:"author"`
	ThumbnailURL          string    `json:"thumbnailUrl"`
	TotalEpisodes         int       `json:"totalEpisodes"`
	CurrentEpisodeID      uint      `json:"currentEpisodeId"`
	CurrentEpisodeNumber  int       `json:"currentEpisodeNumber"`
	CurrentEpisodeTitle   string    `json:"currentEpisodeTitle"`
	LastPositionSeconds   int       `json:"lastPositionSeconds"`
	DurationSeconds       int       `json:"durationSeconds"`
	ProgressPercent       float64   `json:"progressPercent"`
	FormattedPosition     string    `json:"formattedPosition"`
	TotalDurationListened int       `json:"totalDurationListened"`
	LastListenedAt        time.Time `json:"lastListenedAt"`
}

// --- PURE DTOs & VALUE OBJECTS ---

type EpisodeDraft struct {
	AudioID         uint   `json:"audioId"`
	EpisodeNumber   int    `json:"episodeNumber"`
	Title           string `json:"title"`
	StartSeconds    int    `json:"startSeconds"`
	EndSeconds      int    `json:"endSeconds"`
	DurationSeconds int    `json:"duration"`
}

type ProgressResult struct {
	PositionSeconds int     `json:"positionSeconds"`
	DurationSeconds int     `json:"durationSeconds"`
	ProgressPercent float64 `json:"progressPercent"`
	Completed       bool    `json:"completed"`
}

type ResumeState struct {
	CurrentEpisodeID     uint    `json:"currentEpisodeId"`
	CurrentEpisodeNumber int     `json:"currentEpisodeNumber"`
	CurrentEpisodeTitle  string  `json:"currentEpisodeTitle"`
	LastPositionSeconds  int     `json:"lastPositionSeconds"`
	ProgressPercent      float64 `json:"progressPercent"`
	FormattedPosition    string  `json:"formattedPosition"`
}

type AudioFilter struct {
	Search     string
	CategoryID uint
	Tag        string
	Status     string // "listening", "completed", "favorite", "all"
	Page       int
	PageSize   int
}
