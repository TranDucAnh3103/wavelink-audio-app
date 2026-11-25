/**
 * TypeScript Bridge kết nối với Android Native Module: MediaPlaybackModule
 * Quản lý Android MediaStyle Notification & MediaSessionCompat
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { MediaPlaybackModule } = NativeModules;
const eventEmitter = MediaPlaybackModule ? new NativeEventEmitter(MediaPlaybackModule) : null;

export interface MediaMetadata {
  title: string;
  artist: string;
  artwork?: string;
  duration?: number; // seconds
  currentTime?: number; // seconds
  isPlaying?: boolean;
  playbackSpeed?: number;
}

export type MediaActionType =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'seek'
  | 'rewind'
  | 'forward'
  | 'stop';

export interface MediaActionEvent {
  action: MediaActionType;
  value?: number;
}

export const MediaPlayback = {
  /**
   * Khởi chạy Android Foreground Service hiển thị Media Notification
   */
  startService(metadata: MediaMetadata): void {
    if (Platform.OS !== 'android') return;
    MediaPlaybackModule?.startService(metadata);
  },

  /**
   * Cập nhật trạng thái phát (Play/Pause, vị trí seekbar, thời lượng)
   */
  updateState(
    isPlaying: boolean,
    currentPosition: number,
    duration: number,
    playbackSpeed = 1.0
  ): void {
    if (Platform.OS !== 'android') return;
    MediaPlaybackModule?.updateState(
      Boolean(isPlaying),
      Number(currentPosition || 0),
      Number(duration || 0),
      Number(playbackSpeed || 1.0)
    );
  },

  /**
   * Cập nhật thông tin bài hát (Title, Artist, Artwork URL)
   */
  updateMetadata(metadata: Partial<MediaMetadata>): void {
    if (Platform.OS !== 'android') return;
    MediaPlaybackModule?.updateMetadata(metadata);
  },

  /**
   * Dừng service và xóa thông báo khi tắt phát nhạc
   */
  stopService(): void {
    if (Platform.OS !== 'android') return;
    MediaPlaybackModule?.stopService();
  },

  /**
   * Lắng nghe các action từ Media Notification (bấm nút Play, Pause, Next, Prev, Tua Seekbar)
   */
  addMediaActionListener(callback: (event: MediaActionEvent) => void) {
    if (!eventEmitter) return { remove: () => {} };
    return eventEmitter.addListener('onMediaAction', callback);
  },
};
