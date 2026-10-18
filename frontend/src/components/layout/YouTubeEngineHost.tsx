import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { rateCoordinator } from '@/lib/playbackRateCoordinator';
import { toast } from '@/components/ui/Toast';
import { startBackgroundAudio, stopBackgroundAudio } from '@/lib/backgroundAudioKeeper';

export const YouTubeEngineHost: React.FC = () => {
  const setYtInstance = usePlayerStore((s) => s.setYtInstance);
  const handleEpisodeComplete = usePlayerStore((s) => s.handleEpisodeComplete);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const skipSeconds = usePlayerStore((s) => s.skipSeconds);
  const prevEpisode = usePlayerStore((s) => s.prevEpisode);
  const nextEpisode = usePlayerStore((s) => s.nextEpisode);
  const playerRef = useRef<any>(null);
  const isInitializingRef = useRef<boolean>(false);
  const instanceIdRef = useRef<string>(`yt-host-${Date.now()}`);
  const backgroundResumeAttempts = useRef<number>(0);
  const backgroundResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const instanceId = instanceIdRef.current;

    // 1. Setup Media Session Handlers cho màn hình khóa (Lock screen) / Action Center của OS
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const safeSetHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch {}
      };
      safeSetHandler('play', () => resume());
      safeSetHandler('pause', () => pause());
      safeSetHandler('seekbackward', () => skipSeconds(-15));
      safeSetHandler('seekforward', () => skipSeconds(30));
      safeSetHandler('previoustrack', () => prevEpisode());
      safeSetHandler('nexttrack', () => nextEpisode());
      safeSetHandler('seekto', (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          seekTo(details.seekTime);
        }
      });
    }

    // 2. Load YouTube IFrame Script nếu chưa có
    if (!document.getElementById('yt-iframe-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript?.parentNode?.insertBefore(tag, firstScript);
    }

    const initYT = () => {
      if (!window.YT || !window.YT.Player) return;
      if (playerRef.current || isInitializingRef.current) return;
      isInitializingRef.current = true;

      const player = new window.YT.Player('yt-player-target', {
        height: '240',
        width: '320',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          enablejsapi: 1,
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          widget_referrer: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            playerRef.current = player;
            setYtInstance(player, instanceId);
            const targetRate = usePlayerStore.getState().playbackRate || 1.0;
            if (targetRate !== 1.0) {
              rateCoordinator.enforceRateWithRetries(targetRate, 'player_onReady_restore');
            }
          },
          onStateChange: (event: { data: number }) => {
            const state = event.data;
            const stateNames: Record<number, string> = {
              [-1]: 'UNSTARTED',
              0: 'ENDED',
              1: 'PLAYING',
              2: 'PAUSED',
              3: 'BUFFERING',
              5: 'CUED',
            };
            const stateName = stateNames[state] || 'UNKNOWN';

            if (state === window.YT?.PlayerState?.PLAYING) {
              usePlayerStore.setState({ isPlaying: true, isSeeking: false });
              if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
              }
              const targetRate = usePlayerStore.getState().playbackRate || 1.0;
              const actualRate = playerRef.current?.getPlaybackRate?.();
              if (targetRate !== 1.0 && actualRate !== targetRate) {
                rateCoordinator.enforceRateWithRetries(targetRate, 'video_playing_enforce');
              }
            } else if (state === window.YT?.PlayerState?.PAUSED) {
              const currentStore = usePlayerStore.getState();
              // Đồng bộ MediaSession sang 'paused' để Màn hình khóa (Lock Screen) và Action Center
              // ngay lập tức hiển thị nút PLAY (▶), cho phép người dùng bấm tiếp tục nghe khi tắt màn hình
              if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
              }

              // Nếu người dùng không chủ động bấm pause (mà do tab bị ẩn, thoát app, tắt màn hình)
              if (currentStore.isPlaying && !currentStore.isExplicitlyPaused) {
                console.debug('[YouTubeEngineHost] Background interruption detected. Readying lockscreen resume...');
                backgroundResumeAttempts.current += 1;
                // Tối đa 3 lần retry có giới hạn với exponential backoff (500ms, 1000ms, 2000ms)
                // để tránh vòng lặp vô hạn khiến Chrome Android kill process
                if (backgroundResumeAttempts.current <= 3) {
                  const delay = Math.pow(2, backgroundResumeAttempts.current - 1) * 500;
                  if (backgroundResumeTimer.current) clearTimeout(backgroundResumeTimer.current);
                  backgroundResumeTimer.current = setTimeout(() => {
                    if (playerRef.current && !usePlayerStore.getState().isExplicitlyPaused) {
                      try {
                        playerRef.current.playVideo();
                      } catch {}
                    }
                  }, delay);
                }
                // Reset counter sau 10 giây yên tĩnh
                if (backgroundResetTimer.current) clearTimeout(backgroundResetTimer.current);
                backgroundResetTimer.current = setTimeout(() => {
                  backgroundResumeAttempts.current = 0;
                }, 10000);
              } else {
                usePlayerStore.setState({ isPlaying: false });
              }
            } else if (state === window.YT?.PlayerState?.ENDED) {
              const currentStore = usePlayerStore.getState();
              // Chỉ kích hoạt khi đang phát tự nhiên và không do người dùng chủ động tắt, dừng hoặc tua/chuyển bài
              if (currentStore.isPlaying && !currentStore.isExplicitlyPaused && currentStore.currentAudio) {
                usePlayerStore.setState({ isPlaying: false });
                handleEpisodeComplete();
              }
            }

            rateCoordinator.onStateChange(state, stateName);
          },
          onPlaybackRateChange: (event: { data: number }) => {
            if (event && typeof event.data === 'number' && event.data > 0) {
              rateCoordinator.onRateConfirmedByYouTube(event.data);
            }
          },
          onError: (event: { data: number }) => {
            let msg = 'Lỗi khi phát âm thanh YouTube';
            if (event.data === 101 || event.data === 150) {
              msg = 'Video này không cho phép nhúng phát bên ngoài YouTube.';
            } else if (event.data === 100) {
              msg = 'Không tìm thấy video hoặc video đã bị gỡ bỏ.';
            }
            toast.error(msg);
            usePlayerStore.setState({ isPlaying: false });
          },
        },
      });
    };

    window.onYouTubeIframeAPIReady = () => {
      initYT();
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      // Polling fallback bảo đảm khởi tạo thành công trên Safari / Edge / Firefox khi script nạp trễ
      let attempts = 0;
      const readyInterval = setInterval(() => {
        attempts++;
        if (window.YT && window.YT.Player) {
          clearInterval(readyInterval);
          initYT();
        } else if (attempts > 50) {
          clearInterval(readyInterval);
        }
      }, 100);
    }

    // 3. Listener duy trì phát audio, kiểm tra hẹn giờ ngủ và cưỡng chế tốc độ khi ẩn tab / chuyển app / quay lại app
    const handleVisibilityChange = () => {
      const store = usePlayerStore.getState();
      const desiredRate = store.playbackRate || 1.0;

      // Kiểm tra ngay sleep timer khi app hiển thị lại hoặc chuyển trạng thái
      if (store.sleepTimerEndTimestamp && Date.now() >= store.sleepTimerEndTimestamp) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('wavelink_sleep_timer_end');
        }
        usePlayerStore.setState({ sleepTimerMinutes: null, sleepTimerEndTimestamp: null });
        store.pause();
        stopBackgroundAudio();
        toast.info('Đã tự động tắt audio theo hẹn giờ ngủ.');
        return;
      }

      if (document.hidden) {
        // App / Tab chuyển sang chạy nền
        if (store.isPlaying && !store.isExplicitlyPaused) {
          startBackgroundAudio();
          if (playerRef.current) {
            try {
              playerRef.current.playVideo();
            } catch {}
          }
        }
      } else {
        // App quay trở lại màn hình chính
        if (store.isPlaying && !store.isExplicitlyPaused && playerRef.current) {
          try {
            const ytState = playerRef.current.getPlayerState?.();
            if (ytState !== 1) {
              playerRef.current.playVideo();
            }
          } catch {}
        }
        // Chỉ cưỡng chế áp dụng lại tốc độ nếu thực sự bị lệch tốc độ
        const currentYtRate = playerRef.current?.getPlaybackRate?.();
        if (desiredRate !== 1.0 && currentYtRate !== desiredRate) {
          rateCoordinator.enforceRateWithRetries(desiredRate, 'app_foreground_visibility');
        }
      }
    };

    const handleWindowFocus = () => {
      const store = usePlayerStore.getState();
      const desiredRate = store.playbackRate || 1.0;

      if (store.sleepTimerEndTimestamp && Date.now() >= store.sleepTimerEndTimestamp) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('wavelink_sleep_timer_end');
        }
        usePlayerStore.setState({ sleepTimerMinutes: null, sleepTimerEndTimestamp: null });
        store.pause();
        stopBackgroundAudio();
        toast.info('Đã tự động tắt audio theo hẹn giờ ngủ.');
        return;
      }

      if (store.isPlaying && !store.isExplicitlyPaused && playerRef.current) {
        try {
          const ytState = playerRef.current.getPlayerState?.();
          if (ytState !== 1) {
            playerRef.current.playVideo();
          }
        } catch {}
      }
      const currentYtRate = playerRef.current?.getPlaybackRate?.();
      if (desiredRate !== 1.0 && currentYtRate !== desiredRate) {
        rateCoordinator.enforceRateWithRetries(desiredRate, 'app_foreground_focus');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);

    return () => {
      if (backgroundResumeTimer.current) {
        clearTimeout(backgroundResumeTimer.current);
        backgroundResumeTimer.current = null;
      }
      if (backgroundResetTimer.current) {
        clearTimeout(backgroundResetTimer.current);
        backgroundResetTimer.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      rateCoordinator.detachPlayer(instanceId);
      playerRef.current = null;
      isInitializingRef.current = false;
    };
  }, [handleEpisodeComplete, nextEpisode, pause, prevEpisode, resume, seekTo, setYtInstance, skipSeconds]);

  return (
    <div
      id="yt-audio-host-container"
      style={{
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '320px',
        height: '240px',
        opacity: 1,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <div id="yt-player-target" />
    </div>
  );
};
