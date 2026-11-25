'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  Lock,
  XCircle,
} from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { formatTime } from '@/lib/utils';

const RED_START_PX = 24;

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
    seekTo,
    cycleSpeed,
    setScreenLocked,
    close,
  } = usePlayerStore();

  const cardRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const axisLockedRef = useRef<'x' | 'y' | null>(null);
  const didDragRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    setDragX(0);
    setIsDragging(false);
    setIsDismissing(false);
    pointerIdRef.current = null;
    axisLockedRef.current = null;
    didDragRef.current = false;
  }, [currentAudio?.id]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (!currentAudio) return null;

  const safeDuration = duration || currentEpisode?.duration || 14400;
  const percent = Math.min(100, Math.round((currentTime / safeDuration) * 100));

  const cardWidth = cardRef.current?.offsetWidth || 320;
  const dismissThreshold = Math.min(130, Math.max(85, cardWidth * 0.32));
  const absDrag = Math.abs(dragX);
  const showRedOverlay = isDismissing || absDrag >= RED_START_PX;
  const redProgress = isDismissing
    ? 1
    : Math.min(1, Math.max(0, (absDrag - RED_START_PX) / Math.max(1, dismissThreshold - RED_START_PX)));
  const willDismiss = isDismissing || absDrag >= dismissThreshold;

  const handleOpenDetail = () => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    navigate(`/player/${currentAudio.id}`);
  };

  const resetPointerTracking = () => {
    pointerIdRef.current = null;
    axisLockedRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDismissing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, a')) return;

    const pid = e.pointerId ?? 0;
    pointerIdRef.current = pid;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startTimeRef.current = Date.now();
    axisLockedRef.current = null;
    didDragRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pid = e.pointerId ?? 0;
    if (pointerIdRef.current === null || pid !== pointerIdRef.current) return;

    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    if (axisLockedRef.current === null) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        axisLockedRef.current = 'y';
        resetPointerTracking();
        return;
      }
      if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) {
        axisLockedRef.current = 'x';
        didDragRef.current = true;
        setIsDragging(true);
        try {
          e.currentTarget.setPointerCapture?.(pid);
        } catch {
          // Ignore synthetic PointerEvent capture errors in tests
        }
      }
    }

    if (axisLockedRef.current === 'x') {
      setDragX(dx);
    }
  };

  const handlePointerFinish = (e: React.PointerEvent<HTMLDivElement>) => {
    const pid = e.pointerId ?? 0;
    if (pointerIdRef.current === null || pid !== pointerIdRef.current) return;

    const wasHorizontal = axisLockedRef.current === 'x';
    const dx = e.clientX - startXRef.current;

    if (wasHorizontal) {
      try {
        if (e.currentTarget.hasPointerCapture?.(pid)) {
          e.currentTarget.releasePointerCapture(pid);
        }
      } catch {
        // Ignore capture release errors
      }
    }

    resetPointerTracking();

    if (!wasHorizontal) return;

    const width = cardRef.current?.offsetWidth || 320;
    const threshold = Math.min(130, Math.max(85, width * 0.32));
    const velocity = Math.abs(dx) / Math.max(1, Date.now() - startTimeRef.current);

    if (
      e.type !== 'pointercancel' &&
      (Math.abs(dx) >= threshold || (Math.abs(dx) >= 48 && velocity >= 0.55))
    ) {
      setIsDragging(false);
      setIsDismissing(true);
      setDragX((dx >= 0 ? 1 : -1) * Math.max(width, 360));
      dismissTimerRef.current = setTimeout(() => {
        close();
      }, 180);
    } else {
      setIsDragging(false);
      setDragX(0);
    }

    setTimeout(() => {
      didDragRef.current = false;
    }, 50);
  };

  return (
    <aside
      aria-label="Trình phát thu gọn"
      className="fixed bottom-[80px] left-3 right-3 md:left-[76px] lg:left-60 md:right-0 md:bottom-0 z-40"
    >
      {/* Mobile Floating Comic Card & Tablet/Desktop Full Bottom Dock */}
      <div
        ref={cardRef}
        data-testid="mini-player-card"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerFinish}
        onPointerCancel={handlePointerFinish}
        style={{
          transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
          opacity: isDismissing ? 0 : showRedOverlay ? Math.max(0.75, 1 - redProgress * 0.2) : 1,
          transition: isDragging
            ? 'none'
            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, border-color 150ms ease',
        }}
        className={`mini-player-comic md:rounded-none md:border-x-0 md:border-b-0 md:border-t-2 md:shadow-none px-3 py-2 md:px-6 md:py-2.5 flex items-center justify-between gap-2.5 md:gap-6 relative overflow-hidden touch-pan-y select-none ${
          showRedOverlay ? '!border-[#E63946]' : ''
        }`}
      >
        {/* Translucent red dismiss overlay when swiping left/right */}
        {showRedOverlay && (
          <div
            data-testid="mini-player-dismiss-overlay"
            className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] flex items-center justify-center backdrop-blur-[1.5px] transition-opacity duration-100"
            style={{
              backgroundColor: `rgba(230, 57, 70, ${(0.28 + redProgress * 0.47).toFixed(2)})`,
            }}
          >
            <div className="px-3 py-1 rounded-full border-2 border-[#111113] bg-[#E63946] text-white shadow-comic-sm flex items-center gap-1.5 font-extrabold text-xs uppercase tracking-wide">
              <XCircle className="w-4 h-4 shrink-0" strokeWidth={2.5} />
              <span>{willDismiss ? 'Thả để tắt trình phát' : 'Kéo để tắt trình phát'}</span>
            </div>
          </div>
        )}

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

        {/* Desktop Center Zone: Seekbar */}
        <div className="hidden md:flex flex-col items-center gap-1 flex-1 max-w-lg">
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

        {/* Right Zone: Chỉ hiển thị 3 nút: Tua tốc độ (x2), Play/Pause, Khóa màn hình */}
        <div
          data-testid="mini-player-controls"
          className="flex items-center gap-2 shrink-0"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cycleSpeed(user?.id);
            }}
            className="h-9 px-2.5 rounded-lg border-2 border-[#111113] bg-[#FFE600] font-black text-xs text-[#111113] shadow-comic-sm hover:scale-105 active:translate-y-0.5 flex items-center justify-center shrink-0 cursor-pointer"
            title={`Tốc độ hiện tại: ${playbackRate}x (Nhấp để đổi)`}
            aria-label="Tốc độ phát"
          >
            {playbackRate}x
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className={`w-9 h-9 rounded-lg border-2 border-[#111113] ${
              isPlaying ? 'bg-[#FFE600] text-[#111113]' : 'bg-[#3A86FF] text-white'
            } flex items-center justify-center shadow-comic-sm hover:scale-105 active:translate-y-0.5 transition-all cursor-pointer`}
            title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
            aria-label={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" strokeWidth={2.5} />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" strokeWidth={2.5} />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScreenLocked(true);
            }}
            className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[#FFE600] hover:text-[#111113] active:translate-y-0.5 cursor-pointer"
            title="Giữ màn hình / Khóa màn hình (Tránh chạm nhầm)"
            aria-label="Khóa màn hình"
          >
            <Lock className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </aside>
  );
};
