'use client';

import React, { useEffect, useRef } from 'react';
import { Lock, RotateCcw, RotateCw, Play, Pause, Gauge, X } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { PlaybackSpinner } from '@/components/ui/PlaybackSpinner';

interface ScreenLockOverlayProps {
  onClose: () => void;
}

export const ScreenLockOverlay: React.FC<ScreenLockOverlayProps> = ({ onClose }) => {
  const {
    currentAudio,
    currentEpisode,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    playbackRate,
    togglePlay,
    skipSeconds,
  } = usePlayerStore();

  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';

    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      (navigator as any).wakeLock
        .request('screen')
        .then((sentinel: any) => {
          wakeLockRef.current = sentinel;
        })
        .catch(() => {});
    }

    return () => {
      document.body.style.overflow = '';
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch {}
        wakeLockRef.current = null;
      }
    };
  }, []);

  if (!currentAudio) return null;

  const percent = Math.min(100, Math.round((currentTime / (duration || 14400)) * 100));

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      className="screen-lock-overlay"
      onTouchMove={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-label="Màn hình đang khóa"
    >
      <div className="screen-lock-backdrop" />

      <div className="screen-lock-indicator">
        <Lock className="w-3.5 h-3.5 text-yellow-400" strokeWidth={2.5} />
        <span>MÀN HÌNH ĐANG KHÓA (TRÁNH CHẠM)</span>
      </div>

      <div className="screen-lock-content">
        <div className="screen-lock-artwork">
          <img
            src={currentAudio.thumbnailUrl || '/wavelink-icon.png'}
            alt={currentAudio.title}
            className="screen-lock-artwork-img"
          />
          {isPlaying && (
            <div className="screen-lock-artwork-eq">
              <div className="comic-eq-bar !bg-white" />
              <div className="comic-eq-bar !bg-white" />
              <div className="comic-eq-bar !bg-white" />
            </div>
          )}
        </div>

        <div className="screen-lock-meta">
          <p className="screen-lock-episode">
            TẬP {String(currentEpisode?.episodeNumber || 1).padStart(2, '0')} · {currentEpisode?.title || 'Tập 1'}
          </p>
          <h2 className="screen-lock-title">{currentAudio.title}</h2>
          {currentAudio.author && (
            <p className="screen-lock-author">{currentAudio.author}</p>
          )}
        </div>

        <div className="screen-lock-progress-wrap">
          <div className="screen-lock-progress-bar">
            <div
              className="screen-lock-progress-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="screen-lock-time-row">
            <span>{formatTime(currentTime)}</span>
            <span className="font-bold text-yellow-400">{percent}%</span>
            <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
          </div>
        </div>

        <div className="screen-lock-controls">
          <button
            type="button"
            className="screen-lock-btn-secondary"
            onClick={() => skipSeconds(-15)}
            title="Tua lùi 15 giây"
          >
            <RotateCcw className="w-5 h-5" strokeWidth={2.25} />
          </button>

          <button
            type="button"
            className="screen-lock-btn-primary"
            aria-busy={Boolean(isPlaying && isBuffering)}
            onClick={() => togglePlay()}
            title={isPlaying && isBuffering ? 'Đang tải âm thanh' : isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
          >
            {isPlaying && isBuffering ? (
              <PlaybackSpinner
                size={26}
                thickness={3.5}
                color="#111113"
                trackColor="rgba(17, 17, 19, 0.22)"
                label="Đang tải âm thanh"
              />
            ) : isPlaying ? (
              <Pause className="w-7 h-7 fill-current" strokeWidth={2.5} />
            ) : (
              <Play className="w-7 h-7 fill-current ml-0.5" strokeWidth={2.5} />
            )}
          </button>

          <button
            type="button"
            className="screen-lock-btn-secondary"
            onClick={() => skipSeconds(30)}
            title="Tua tiến 30 giây"
          >
            <RotateCw className="w-5 h-5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="screen-lock-speed-badge">
          <Gauge className="w-3.5 h-3.5" strokeWidth={2.25} />
          <span>Tốc độ: {playbackRate}x</span>
        </div>

        <p className="screen-lock-hint">
          Nhấn nút <strong className="text-white bg-white/20 px-1 py-0.5 rounded">[✕]</strong> ở góc dưới bên phải để mở khóa
        </p>
      </div>

      <button
        type="button"
        className="screen-lock-close-btn"
        onClick={onClose}
        title="Nhấn để tắt lớp bảo vệ màn hình"
        aria-label="Tắt lớp khóa màn hình"
      >
        <X className="w-6 h-6" strokeWidth={2.5} />
      </button>
    </div>
  );
};
