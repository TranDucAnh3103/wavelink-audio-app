/**
 * mobileBridge.ts
 * Module kết nối hai chiều (Two-way Bridge) giữa WaveLink Web và React Native Mobile Shell.
 * Được thiết kế hoàn toàn độc lập, an toàn khi chạy trên trình duyệt web thông thường.
 */

import { usePlayerStore } from '@/stores/playerStore';

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    __wavelinkMobileDispatch?: (action: string, payload?: unknown) => void;
  }
}

export interface PlaybackMessagePayload {
  isPlaying: boolean;
  title: string;
  artist: string;
  artwork?: string;
  duration?: number;
  currentTime?: number;
}

/**
 * Kiểm tra xem môi trường hiện tại có phải là React Native WebView không
 */
export function isMobileApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.ReactNativeWebView);
}

/**
 * Gửi trạng thái âm thanh sang React Native Shell để cập nhật Bong bóng nổi & Notification
 */
export function notifyMobilePlaybackState(payload: PlaybackMessagePayload): void {
  if (!isMobileApp() || !window.ReactNativeWebView) return;

  try {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: 'WAVELINK_PLAYBACK_STATE',
        payload,
      })
    );
  } catch (error) {
    console.debug('[mobileBridge] Failed to post message to native:', error);
  }
}

/**
 * Khởi tạo listener nhận lệnh từ Bong bóng nổi hoặc Notification (Play/Pause, Skip...)
 * và lắng nghe thay đổi của Zustand playerStore để tự động đồng bộ sang Mobile.
 */
export function initMobileBridge(): () => void {
  if (typeof window === 'undefined') return () => {};

  // 1. Đăng ký hàm nhận lệnh từ Native
  window.__wavelinkMobileDispatch = (action: string, payload?: unknown) => {
    const store = usePlayerStore.getState();

    switch (action) {
      case 'togglePlay':
        store.togglePlay();
        break;
      case 'play':
        store.resume();
        break;
      case 'pause':
        store.pause();
        break;
      case 'next':
        store.nextEpisode();
        break;
      case 'prev':
        store.prevEpisode();
        break;
      case 'seekTo':
        if (typeof payload === 'number') {
          store.seekTo(payload);
        }
        break;
      default:
        console.debug('[mobileBridge] Unknown native action:', action);
        break;
    }
  };

  // 2. Tự động subscribe trạng thái playerStore để gửi sang Mobile khi chạy trong WebView
  let previousAudioId: number | string | null = null;
  let previousEpisodeId: number | string | null = null;
  let previousPlaying: boolean | null = null;

  const unsubscribe = usePlayerStore.subscribe((state) => {
    if (!isMobileApp()) return;

    const currentAudio = state.currentAudio;
    const currentEpisode = state.currentEpisode;
    const isPlaying = state.isPlaying;

    const audioId = currentAudio?.id ?? null;
    const episodeId = currentEpisode?.id ?? null;

    // Chỉ gửi khi có sự thay đổi về bài hát hoặc trạng thái play/pause
    if (audioId !== previousAudioId || episodeId !== previousEpisodeId || isPlaying !== previousPlaying) {
      previousAudioId = audioId;
      previousEpisodeId = episodeId;
      previousPlaying = isPlaying;

      notifyMobilePlaybackState({
        isPlaying,
        title: currentEpisode?.title || currentAudio?.title || 'WaveLink Audio',
        artist: currentAudio?.author || 'WaveLink',
        artwork: currentAudio?.thumbnailUrl || '',
        duration: state.duration,
        currentTime: state.currentTime,
      });
    }
  });

  return () => {
    unsubscribe();
    if (window.__wavelinkMobileDispatch) {
      delete window.__wavelinkMobileDispatch;
    }
  };
}
