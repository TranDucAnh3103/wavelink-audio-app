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
	"audio-app-backend/infra/external"
	"audio-app-backend/modules/stream"
)

func main() {
	cfg := config.Load()

	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if cfg.IsProduction() {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, opts)))
	} else {
		slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, opts)))
	}
	slog.Info("🎧 Khởi động WaveLink Standalone Stream Proxy...", "env", cfg.AppEnv, "port", cfg.StreamPort)

	urlTTL := time.Duration(cfg.StreamURLTTLMinutes) * time.Minute
	if urlTTL <= 0 {
		urlTTL = 210 * time.Minute
	}
	extractor := external.NewDefaultStreamExtractor(cfg)
	cache := stream.NewURLCache(extractor, urlTTL, 500)
	tokens := stream.NewTokenManager(cfg.StreamTokenSecret)
	limiter := stream.NewConcurrencyLimiter(cfg.StreamMaxConcurrentPerUser)
	handler := stream.NewHandler(tokens, cache, limiter, cfg.AllowedOrigins, cfg.StreamChunkSizeBytes)

	mux := http.NewServeMux()
	mux.Handle("/health", handler.HealthHandler())
	mux.Handle("/stream/health", handler.HealthHandler())
	mux.Handle("/stream/", handler)

	srv := &http.Server{
		Addr:              ":" + cfg.StreamPort,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info(fmt.Sprintf("Stream Proxy đang lắng nghe tại: http://localhost:%s", cfg.StreamPort))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Lỗi khởi động Stream Proxy", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("Nhận tín hiệu dừng Stream Proxy, đang xả kết nối...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("Dừng Stream Proxy khẩn cấp", "error", err)
	} else {
		slog.Info("Stream Proxy đã dừng an toàn")
	}
}
