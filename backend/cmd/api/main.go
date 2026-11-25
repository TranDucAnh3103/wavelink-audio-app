package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"audio-app-backend/config"
	infraDB "audio-app-backend/infra/db"
	"audio-app-backend/infra/external"
	"audio-app-backend/modules/stream"
	"audio-app-backend/server"
)

func main() {
	// 1. Nạp cấu hình trước
	cfg := config.Load()

	// 2. Khởi tạo Structured Logger
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if cfg.IsProduction() {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, opts)))
	} else {
		slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, opts)))
	}
	slog.Info("🚀 Khởi động YouTube Audio Library Backend...", "env", cfg.AppEnv, "port", cfg.Port)

	// 3. Kết nối Cơ sở dữ liệu
	db, err := infraDB.InitDatabase(cfg.DBDriver, cfg.DBSource, cfg.IsProduction())
	if err != nil {
		slog.Error("Không thể kết nối cơ sở dữ liệu", "error", err)
		os.Exit(1)
	}

	// Tự động kiểm tra seed mặc định
	if err := infraDB.EnsureBaselineSeed(db, cfg.IsProduction()); err != nil {
		slog.Warn("Tự động kiểm tra seed mặc định gặp cảnh báo", "error", err)
	}

	// 4. Khởi tạo Stream Proxy & Gin Router
	urlTTL := time.Duration(cfg.StreamURLTTLMinutes) * time.Minute
	if urlTTL <= 0 {
		urlTTL = 210 * time.Minute
	}
	streamExtractor := external.NewDefaultStreamExtractor(cfg)
	streamCache := stream.NewURLCache(streamExtractor, urlTTL, 500)
	streamTokens := stream.NewTokenManager(cfg.StreamTokenSecret)
	streamLimiter := stream.NewConcurrencyLimiter(cfg.StreamMaxConcurrentPerUser)
	streamHandler := stream.NewHandler(streamTokens, streamCache, streamLimiter, cfg.AllowedOrigins, cfg.StreamChunkSizeBytes)

	router := server.SetupRouterWithStream(cfg, db, &server.StreamDeps{
		Tokens:    streamTokens,
		Cache:     streamCache,
		Extractor: streamExtractor,
	})

	// Mount /stream/ outside Gin middleware (bypasses ETag buffer, Gin Logger, and API timeouts)
	rootMux := http.NewServeMux()
	rootMux.Handle("/stream/health", streamHandler.HealthHandler())
	rootMux.Handle("/stream/", streamHandler)
	rootMux.Handle("/", router)

	// 5. Khởi động HTTP Server với Graceful Shutdown (không đặt WriteTimeout toàn cục để không cắt luồng audio dài)
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           rootMux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info(fmt.Sprintf("Máy chủ đang lắng nghe tại: http://localhost:%s", cfg.Port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Lỗi khởi động máy chủ", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("Nhận tín hiệu dừng, đang xả kết nối...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("Dừng máy chủ khẩn cấp", "error", err)
	} else {
		slog.Info("Máy chủ đã dừng an toàn (Graceful Shutdown)")
	}
}