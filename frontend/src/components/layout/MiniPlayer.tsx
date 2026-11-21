'use client';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Lock,
  X,
  Maximize2,
} from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { formatTime } from '@/lib/utils';

export const MiniPlayer: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentAudio,
    currentEpisode,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    togglePlay,
    skipSeconds,
    seekTo,
    cycleSpeed,
    setScreenLocked,
    close,
  } = usePlayerStore();

  if (!currentAudio) return null;

  const safeDuration = duration || currentEpisode?.duration || 14400;
  const percent = Math.min(100, Math.round((currentTime / safeDuration) * 100));

  const handleOpenDetail = () => {
    navigate(`/player/${currentAudio.id}`);
  };

  return (
    <aside
      aria-label="Trình phát thu gọn"
      className="fixed bottom-[68px] left-3 right-3 md:left-[76px] lg:left-60 md:right-0 md:bottom-0 z-40"
    >
      {/* Mobile Floating Comic Card & Tablet/Desktop Full Bottom Dock */}
      <div className="mini-player-comic md:rounded-none md:border-x-0 md:border-b-0 md:border-t-2 md:shadow-none px-3 py-2 md:px-6 md:py-2.5 flex items-center justify-between gap-2.5 md:gap-6 relative overflow-hidden">
        {/* Top thin progress bar on Mobile */}
        <div className="md:hidden absolute top-0 inset-x-0 h-1 bg-[var(--surface-muted)]">
          <div
            className="h-full bg-[#3A86FF] transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Left Zone: Artwork + Title & Episode */}
        <div
          className="flex items-center gap-2.5 md:gap-3 min-w-0 flex-1 md:flex-initial md:w-[30%] cursor-pointer pt-0.5 md:pt-0"
          onClick={handleOpenDetail}
        >
          <div className="relative w-11 h-11 md:w-12 md:h-12 rounded-lg bg-[var(--surface-muted)] border-2 border-[var(--border-ink)] shrink-0 overflow-hidden shadow-comic-sm">
            <img
              src={currentAudio.thumbnailUrl || '/wavelink-icon.png'}
              alt={currentAudio.title}
              className="w-full h-full object-cover"
            />
            {isPlaying && (
              <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] flex items-center justify-center">
                <div className="comic-eq-container">
                  <div className="comic-eq-bar !bg-white" />
                  <div className="comic-eq-bar !bg-white" />
                  <div className="comic-eq-bar !bg-white" />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="badge-comic badge-comic-yellow text-[9px] py-0 px-1.5 font-black">
                TẬP {String(currentEpisode?.episodeNumber || 1).padStart(2, '0')} · {percent}%
              </span>
              {isPlaying ? (
                <span className="text-[10px] font-black text-[#3A86FF] uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3A86FF] animate-ping" />
                  <span className="hidden sm:inline">Đang phát</span>
                </span>
              ) : (
                <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase hidden sm:inline">
                  Tạm dừng
                </span>
              )}
            </div>
            <span className="font-extrabold text-xs md:text-sm text-[var(--ink-primary)] truncate leading-tight">
              {currentAudio.title}
            </span>
            <span className="text-[11px] font-semibold text-[var(--ink-secondary)] truncate">
              {currentEpisode?.title || 'Tập 1'}
            </span>
          </div>
        </div>

        {/* Desktop Center Zone: Transport + Seekbar */}
        <div className="hidden md:flex flex-col items-center gap-1 flex-1 max-w-lg">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => skipSeconds(-10)}
              className="w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)] flex items-center justify-center text-[var(--ink-primary)] cursor-pointer transition-colors"
              title="Tua lùi 10s"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={() => togglePlay()}
              className={`w-10 h-10 rounded-full border-2 border-[#111113] ${
                isPlaying ? 'bg-[#FFE600] text-[#111113]' : 'bg-[#3A86FF] text-white'
              } flex items-center justify-center shadow-comic-sm hover:scale-105 active:translate-y-0.5 cursor-pointer transition-all`}
              title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" strokeWidth={2.5} />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" strokeWidth={2.5} />
              )}
            </button>
            <button
              type="button"
              onClick={() => skipSeconds(10)}
              className="w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)] flex items-center justify-center text-[var(--ink-primary)] cursor-pointer transition-colors"
              title="Tua tới 10s"
            >
              <RotateCw className="w-4 h-4" strokeWidth={2.25} />
            </button>
          </div>

          <div className="w-full flex items-center gap-2 text-[10px] font-mono font-bold text-[var(--ink-muted)]">
            <span className="w-11 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              aria-label="Thanh tiến trình phát"
              min={0}
              max={safeDuration}
              value={Math.min(currentTime, safeDuration)}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="comic-slider !h-2 flex-1"
            />
            <span className="w-11">{formatTime(safeDuration)}</span>
          </div>
        </div>

        {/* Right Zone: Speed, Screen Lock, Mobile Play/Skip, Open Detail, Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cycleSpeed(user?.id);
            }}
            className="h-8 px-2 rounded-lg border-2 border-[#111113] bg-[#FFE600] font-black text-xs text-[#111113] shadow-comic-sm hover:scale-105 active:translate-y-0.5 flex items-center justify-center shrink-0 cursor-pointer"
            title={`Tốc độ hiện tại: ${playbackRate}x (Nhấp để đổi)`}
          >
            {playbackRate}x
          </button>

          {isPlaying && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setScreenLocked(true);
              }}
              className="w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[#FFE600] hover:text-[#111113] active:translate-y-0.5 cursor-pointer"
              title="Giữ màn hình / Khóa màn hình (Tránh chạm nhầm)"
            >
              <Lock className="w-4 h-4" strokeWidth={2.25} />
            </button>
          )}

          {/* Mobile-only skip & play buttons */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              skipSeconds(10);
            }}
            className="md:hidden w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] cursor-pointer"
            title="Tua 10s"
          >
            <RotateCw className="w-4 h-4" strokeWidth={2.25} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className={`md:hidden w-9 h-9 rounded-lg border-2 border-[#111113] ${
              isPlaying ? 'bg-[#FFE600] text-[#111113]' : 'bg-[#3A86FF] text-white'
            } flex items-center justify-center shadow-comic-sm active:translate-y-0.5 transition-all cursor-pointer`}
            title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" strokeWidth={2.5} />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" strokeWidth={2.5} />
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenDetail}
            className="hidden md:flex w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] items-center justify-center text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] cursor-pointer"
            title="Mở trang trình phát đầy đủ"
          >
            <Maximize2 className="w-4 h-4" strokeWidth={2.25} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-muted)] flex items-center justify-center text-[var(--ink-secondary)] hover:text-[#E63946] hover:border-[#E63946] cursor-pointer transition-colors"
            title="Đóng trình phát"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </aside>
  );
};
