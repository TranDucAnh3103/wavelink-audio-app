package db

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"audio-app-backend/core/domain"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func parseEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil && i > 0 {
			return i
		}
	}
	return defaultVal
}

// InitDatabase khởi tạo kết nối GORM cho SQLite (dev/test) hoặc MySQL (production)
func InitDatabase(driver, source string, isProduction bool) (*gorm.DB, error) {
	var dialector gorm.Dialector

	switch driver {
	case "mysql":
		dialector = mysql.Open(source)
	case "sqlite":
		dialector = sqlite.Open(source)
	default:
		slog.Warn("Driver không xác định, sử dụng mặc định SQLite", "driver", driver)
		dialector = sqlite.Open(source)
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		PrepareStmt:                              true, // Bật cache Prepared Statements tối ưu hiệu năng truy vấn gấp 2-3 lần
		DisableForeignKeyConstraintWhenMigrating: true, // Tránh lỗi MySQL 3780 khi migrate bảng có khóa ngoại cũ khác kiểu INT/BIGINT
		Logger:                                   logger.Default.LogMode(logger.Warn),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	})
	if err != nil {
		return nil, fmt.Errorf("không thể mở kết nối database: %w", err)
	}

	// Cấu hình Connection Pool tối ưu cho Cloud MySQL (Aiven, Render, RDS, Ubuntu) & SQLite
	sqlDB, err := db.DB()
	if err == nil {
		maxOpen := parseEnvInt("DB_MAX_OPEN_CONNS", 25)
		maxIdle := parseEnvInt("DB_MAX_IDLE_CONNS", 10)
		maxLifeMin := parseEnvInt("DB_CONN_MAX_LIFETIME_MINUTES", 15)
		maxIdleMin := parseEnvInt("DB_CONN_MAX_IDLE_TIME_MINUTES", 3)

		sqlDB.SetMaxOpenConns(maxOpen)
		sqlDB.SetMaxIdleConns(maxIdle)
		sqlDB.SetConnMaxLifetime(time.Duration(maxLifeMin) * time.Minute)
		sqlDB.SetConnMaxIdleTime(time.Duration(maxIdleMin) * time.Minute)

		slog.Info(" Đã tối ưu SQL Connection Pool (Cloud Aiven/Render/Ubuntu ready)",
			"maxOpen", maxOpen,
			"maxIdle", maxIdle,
			"maxLife", fmt.Sprintf("%dm", maxLifeMin),
			"maxIdleTime", fmt.Sprintf("%dm", maxIdleMin))
	}

	if driver == "sqlite" {
		// Bật WAL mode, busy_timeout 5s để tránh nghẽn thread và lỗi SQLITE_BUSY
		db.Exec("PRAGMA journal_mode = WAL;")
		db.Exec("PRAGMA busy_timeout = 5000;")
		db.Exec("PRAGMA synchronous = NORMAL;")
		slog.Info(" Đã kích hoạt SQLite WAL mode và busy_timeout (5000ms)")
	}

	// Kiểm tra kết nối ping thực tế với cơ chế Retry cho Cloud Database (Aiven/Render)
	var pingErr error
	maxRetries := 5
	for i := 1; i <= maxRetries; i++ {
		pingErr = sqlDB.Ping()
		if pingErr == nil {
			break
		}
		slog.Warn(fmt.Sprintf("Thử ping cơ sở dữ liệu lần %d/%d chưa sẵn sàng, đợi 3s...", i, maxRetries), "error", pingErr)
		time.Sleep(3 * time.Second)
	}
	if pingErr != nil {
		return nil, fmt.Errorf("không thể ping cơ sở dữ liệu sau %d lần thử: %w", maxRetries, pingErr)
	}
	slog.Info(" Kết nối cơ sở dữ liệu thành công", "driver", driver)

	// Luôn tự động AutoMigrate để bổ sung bảng/cột mới mà không mất dữ liệu cũ
	if err := AutoMigrate(db); err != nil {
		slog.Warn("Cảnh báo GORM AutoMigrate khi khởi động", "error", err)
	}

	// Khởi động Background Cleaner dọn dẹp tài khoản Guest rác
	StartGuestCleanupCron(db)

	return db, nil
}

// AutoMigrate tự động đồng bộ hóa cấu trúc Schema từ các Struct Domain
func AutoMigrate(db *gorm.DB) error {
	slog.Info("Đang chạy GORM AutoMigrate cho tất cả thực thể...")
	models := []interface{}{
		&domain.User{},
		&domain.Category{},
		&domain.Tag{},
		&domain.Audio{},
		&domain.Episode{},
		&domain.ListeningProgress{},
		&domain.ListeningHistory{},
		&domain.Favorite{},
		&domain.Notification{},
		&domain.NotificationPreference{},
		&domain.MembershipOrder{},
		&domain.SystemSetting{},
		&domain.CommunityMessage{},
	}

	var firstErr error
	for _, model := range models {
		if err := db.AutoMigrate(model); err != nil {
			slog.Warn("GORM AutoMigrate gặp cảnh báo trên model", "model", fmt.Sprintf("%T", model), "error", err)
			if firstErr == nil {
				firstErr = err
			}
		}
	}

	// Đảm bảo an toàn tuyệt đối cho MySQL/SQLite nếu bảng đã tồn tại từ migration cũ
	m := db.Migrator()
	if !m.HasColumn(&domain.Episode{}, "is_vip") {
		_ = m.AddColumn(&domain.Episode{}, "is_vip")
	}
	if !m.HasColumn(&domain.Audio{}, "is_vip_only") {
		_ = m.AddColumn(&domain.Audio{}, "is_vip_only")
	}
	if !m.HasColumn(&domain.Audio{}, "created_by") {
		_ = m.AddColumn(&domain.Audio{}, "created_by")
	}
	if !m.HasColumn(&domain.Audio{}, "free_episodes_count") {
		_ = m.AddColumn(&domain.Audio{}, "free_episodes_count")
		db.Model(&domain.Audio{}).Where("free_episodes_count = 0 OR free_episodes_count IS NULL").Update("free_episodes_count", 1)
	}
	if !m.HasColumn(&domain.Audio{}, "stream_status") {
		_ = m.AddColumn(&domain.Audio{}, "stream_status")
	}
	if !m.HasColumn(&domain.Audio{}, "stream_checked_at") {
		_ = m.AddColumn(&domain.Audio{}, "stream_checked_at")
	}
	if !m.HasColumn(&domain.Audio{}, "audio_mime") {
		_ = m.AddColumn(&domain.Audio{}, "audio_mime")
	}
	if !m.HasColumn(&domain.NotificationPreference{}, "external_audio") {
		_ = m.AddColumn(&domain.NotificationPreference{}, "external_audio")
	}
	if !m.HasColumn(&domain.NotificationPreference{}, "block_all") {
		_ = m.AddColumn(&domain.NotificationPreference{}, "block_all")
	}
	if !m.HasColumn(&domain.NotificationPreference{}, "welcome_seeded") {
		_ = m.AddColumn(&domain.NotificationPreference{}, "welcome_seeded")
	}

	// Đảm bảo bảng membership_orders có đầy đủ các cột phục vụ cổng thanh toán payOS
	orderColumns := []string{
		"payos_order_code",
		"payment_link_id",
		"checkout_url",
		"qr_code_data",
		"qr_code_url",
		"provider",
		"bank_bin",
		"account_number",
		"account_name",
		"transfer_content",
		"duration_days",
		"expires_at",
		"paid_at",
	}
	for _, col := range orderColumns {
		if !m.HasColumn(&domain.MembershipOrder{}, col) {
			_ = m.AddColumn(&domain.MembershipOrder{}, col)
		}
	}

	return firstErr
}

// SeedInitialData nạp toàn bộ danh mục, tag, tài khoản và audio mẫu chuẩn
func SeedInitialData(db *gorm.DB, isProduction bool) error {
	_, err := RunComprehensiveSeed(db)
	return err
}

// StartGuestCleanupCron chạy nền dọn dẹp toàn bộ tài khoản khách rác cũ để tối ưu DB
func StartGuestCleanupCron(db *gorm.DB) {
	go func() {
		cleanup := func() {
			if !db.Migrator().HasTable("users") {
				return
			}
			// Xóa các guest cũ và tiến trình/lịch sử mồ côi
			res := db.Exec(`
				DELETE FROM users 
				WHERE is_guest = 1
			`)
			if res.Error == nil && res.RowsAffected > 0 {
				slog.Info("🧹 Đã dọn dẹp tài khoản khách rác cũ trong DB", "deleted_rows", res.RowsAffected)
			}
			if db.Migrator().HasTable("listening_progress") {
				db.Exec(`DELETE FROM listening_progress WHERE user_id NOT IN (SELECT id FROM users)`)
			}
			if db.Migrator().HasTable("listening_history") {
				db.Exec(`DELETE FROM listening_history WHERE user_id NOT IN (SELECT id FROM users)`)
			}
		}

		cleanup()
		ticker := time.NewTicker(24 * time.Hour)
		for range ticker.C {
			cleanup()
		}
	}()
}
