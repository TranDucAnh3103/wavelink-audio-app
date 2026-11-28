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
            if (usePlayerStore.getState().activeEngine !== 'youtube') return;
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
              usePlayerStore.setState({
                isPlaying: true,
                isBuffering: false,
                isSeeking: false,
                isRetrying: false,
                retryAttempt: 0,
                playbackError: null,
                bufferingStartedAt: null,
              });
              if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
              }
              const targetRate = usePlayerStore.getState().playbackRate || 1.0;
              const actualRate = playerRef.current?.getPlaybackRate?.();
              if (typeof actualRate === 'number' && Math.abs(actualRate - targetRate) > 0.05) {
                rateCoordinator.enforceRateWithRetries(targetRate, 'video_playing_enforce');
              } else if (targetRate !== 1.0) {
                rateCoordinator.enforceRateWithRetries(targetRate, 'video_playing_enforce_safe');
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
                    if (
                      playerRef.current &&
                      usePlayerStore.getState().activeEngine === 'youtube' &&
                      !usePlayerStore.getState().isExplicitlyPaused
                    ) {
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
                usePlayerStore.setState({ isPlaying: false, isBuffering: false });
              }
            } else if (state === 3 || state === -1) { // BUFFERING / UNSTARTED
              const currentStore = usePlayerStore.getState();
              if (currentStore.isPlaying && !currentStore.isExplicitlyPaused) {
                usePlayerStore.setState({
                  isBuffering: true,
                  bufferingStartedAt: currentStore.bufferingStartedAt ?? Date.now(),
                });
              }
              // YouTube thường reset playbackRate về 1.0 trong quá trình buffer / recover
              if (state === 3) {
                const bufferRate = currentStore.playbackRate || 1.0;
                if (bufferRate !== 1.0) {
                  setTimeout(() => {
                    if (
                      playerRef.current &&
                      usePlayerStore.getState().activeEngine === 'youtube' &&
                      usePlayerStore.getState().playbackRate === bufferRate
                    ) {
                      rateCoordinator.enforceRateWithRetries(bufferRate, 'buffering_rate_enforce');
                    }
                  }, 600);
                }
              }
            } else if (state === window.YT?.PlayerState?.ENDED) {
              const currentStore = usePlayerStore.getState();
              const loadedId = playerRef.current?.getVideoData?.()?.video_id;
              if (
                loadedId &&
                currentStore.currentAudio?.youtubeVideoId &&
                loadedId !== currentStore.currentAudio.youtubeVideoId
              ) {
                return;
              }
              // Chỉ kích hoạt khi đang phát tự nhiên và không do người dùng chủ động tắt, dừng hoặc tua/chuyển bài
              if (currentStore.isPlaying && !currentStore.isExplicitlyPaused && currentStore.currentAudio) {
                usePlayerStore.setState({ isPlaying: false, isBuffering: false });
                handleEpisodeComplete();
              }
            }

            rateCoordinator.onStateChange(state, stateName);
          },
          onPlaybackRateChange: (event: { data: number }) => {
            if (usePlayerStore.getState().activeEngine !== 'youtube') return;
            if (event && typeof event.data === 'number' && event.data > 0) {
              rateCoordinator.onRateConfirmedByYouTube(event.data);
            }
          },
          onError: (event: { data: number }) => {
            if (usePlayerStore.getState().activeEngine !== 'youtube') return;
            let msg = 'Lỗi khi phát âm thanh YouTube';
            if (event.data === 101 || event.data === 150) {
              msg = 'Video này không cho phép nhúng phát bên ngoài YouTube.';
            } else if (event.data === 100) {
              msg = 'Không tìm thấy video hoặc video đã bị gỡ bỏ.';
            }
            toast.error(msg);
            usePlayerStore.setState({ isPlaying: false, isBuffering: false, playbackError: msg });
          },
        },
      });
    };

    window.onYouTubeIframeAPIReady = () => {
      initYT();
    };

    let readyInterval: ReturnType<typeof setInterval> | null = null;
    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      // Polling fallback bảo đảm khởi tạo thành công trên Safari / Edge / Firefox khi script nạp trễ
      let attempts = 0;
      readyInterval = setInterval(() => {
        if (typeof window === 'undefined') {
          if (readyInterval) clearInterval(readyInterval);
          return;
        }
        attempts++;
        if (window.YT && window.YT.Player) {
          if (readyInterval) clearInterval(readyInterval);
          readyInterval = null;
          initYT();
        } else if (attempts > 50) {
          if (readyInterval) clearInterval(readyInterval);
          readyInterval = null;
        }
      }, 100);
    }

    // 3. Listener duy trì phát audio, kiểm tra hẹn giờ ngủ và cưỡng chế tốc độ khi ẩn tab / chuyển app / quay lại app
    const handleVisibilityChange = () => {
      const store = usePlayerStore.getState();
      if (store.activeEngine !== 'youtube') return;

      // Kiểm tra ngay sleep timer khi app hiển thị lại hoặc chuyển trạng thái
      if (
        store.sleepTimerMode !== 'end_of_episode' &&
        store.sleepTimerEndTimestamp &&
        Date.now() >= store.sleepTimerEndTimestamp
      ) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('wavelink_sleep_timer_end');
          localStorage.removeItem('wavelink_sleep_timer_mode');
        }
        usePlayerStore.setState({
          sleepTimerMode: null,
          sleepTimerMinutes: null,
          sleepTimerEndTimestamp: null,
        });
        store.pause();
        stopBackgroundAudio();
        toast.info('Đã tự động tắt audio theo hẹn giờ ngủ.');
        return;
      }

      if (document.hidden) {
        // App / Tab chuyển sang chạy nền
        if (store.isPlaying && !store.isExplicitlyPaused && usePlayerStore.getState().activeEngine === 'youtube') {
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
        // Enforce rate sau delay để YouTube player kịp recover từ background
        setTimeout(() => {
          if (usePlayerStore.getState().activeEngine !== 'youtube') return;
          const currentYtRate = playerRef.current?.getPlaybackRate?.();
          const latestDesiredRate = usePlayerStore.getState().playbackRate || 1.0;
          if (Math.abs((currentYtRate || 1.0) - latestDesiredRate) > 0.05 || latestDesiredRate !== 1.0) {
            rateCoordinator.enforceRateWithRetries(latestDesiredRate, 'app_foreground_visibility_delayed');
          }
        }, 800);
      }
    };

    const handleWindowFocus = () => {
      const store = usePlayerStore.getState();
      if (store.activeEngine !== 'youtube') return;

      if (
        store.sleepTimerMode !== 'end_of_episode' &&
        store.sleepTimerEndTimestamp &&
        Date.now() >= store.sleepTimerEndTimestamp
      ) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('wavelink_sleep_timer_end');
          localStorage.removeItem('wavelink_sleep_timer_mode');
        }
        usePlayerStore.setState({
          sleepTimerMode: null,
          sleepTimerMinutes: null,
          sleepTimerEndTimestamp: null,
        });
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
      setTimeout(() => {
        if (usePlayerStore.getState().activeEngine !== 'youtube') return;
        const currentYtRate = playerRef.current?.getPlaybackRate?.();
        const latestDesiredRate = usePlayerStore.getState().playbackRate || 1.0;
        if (Math.abs((currentYtRate || 1.0) - latestDesiredRate) > 0.05 || latestDesiredRate !== 1.0) {
          rateCoordinator.enforceRateWithRetries(latestDesiredRate, 'app_foreground_focus_delayed');
        }
      }, 800);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);

    return () => {
      if (readyInterval) {
        clearInterval(readyInterval);
        readyInterval = null;
      }
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
