import { axiosClient } from '@/lib/axiosClient';
import { ProgressPayload } from '@/types';
import { localDb } from './localDb';
import { formatTime } from '@/lib/utils';
import { guestSessionService } from './guestSessionService';
import { markLocalProgressServerSynced } from '@/lib/progressSnapshot';

const OFFLINE_QUEUE_KEY = 'offline_progress_queue';

export const progressService = {
  async updateProgress(payload: ProgressPayload, isLive = true): Promise<void> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;

    // Nếu chưa đăng nhập / là khách: lưu tạm vào sessionStorage, không gửi lên DB
    if (!token) {
      guestSessionService.saveGuestProgress(payload);

      // Cập nhật local memory để đồng bộ hiển thị ngay lập tức
      const db = localDb.get();
      const audio = db.audios.find((a) => String(a.id) === String(payload.audioId));
      if (audio) {
        audio.lastPositionSeconds = payload.positionSeconds;
        audio.progressPercent = Math.min(100, Math.round(payload.progressPercent));
        audio.formattedPosition = formatTime(payload.positionSeconds);
        audio.currentEpisodeId = payload.episodeId;
        const ep = audio.episodes?.find((e) => String(e.id) === String(payload.episodeId));
        if (ep) {
          ep.positionSeconds = payload.positionSeconds;
          ep.progressPercent = Math.min(100, Math.round(payload.progressPercent));
          if (payload.progressPercent >= 95) ep.completed = true;
          audio.currentEpisodeNumber = ep.episodeNumber;
          audio.currentEpisodeTitle = ep.title;
        }
        localDb.save();
      }
      return;
    }

    if (isLive && isOnline) {
      try {
        await axiosClient.put('/progress', payload);
        markLocalProgressServerSynced(payload.audioId, payload.episodeId, payload.positionSeconds);
      } catch (err) {
        console.warn('updateProgress live API failed, saving to offline queue', err);
        this.enqueueOfflineProgress(payload);
      }
    } else {
      this.enqueueOfflineProgress(payload);
    }

    // Always update local storage
    const db = localDb.get();
    const audio = db.audios.find((a) => String(a.id) === String(payload.audioId));
    if (audio) {
      audio.lastPositionSeconds = payload.positionSeconds;
      audio.progressPercent = Math.min(100, Math.round(payload.progressPercent));
      audio.formattedPosition = formatTime(payload.positionSeconds);
      audio.currentEpisodeId = payload.episodeId;
      const ep = audio.episodes?.find((e) => String(e.id) === String(payload.episodeId));
      if (ep) {
        ep.positionSeconds = payload.positionSeconds;
        ep.progressPercent = Math.min(100, Math.round(payload.progressPercent));
        if (payload.progressPercent >= 95) ep.completed = true;
        audio.currentEpisodeNumber = ep.episodeNumber;
        audio.currentEpisodeTitle = ep.title;
      }
      localDb.save();
    }
  },

  enqueueOfflineProgress(payload: ProgressPayload): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const q: ProgressPayload[] = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      const idx = q.findIndex((item) => item.audioId === payload.audioId && item.episodeId === payload.episodeId);
      if (idx !== -1) {
        q[idx] = payload;
      } else {
        q.push(payload);
      }
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
    } catch (err) {
      console.warn('enqueueOfflineProgress error:', err);
    }
  },

  async syncOfflineQueue(): Promise<number> {
    if (typeof localStorage === 'undefined') return 0;
    try {
      const qStr = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!qStr) return 0;
      const q: ProgressPayload[] = JSON.parse(qStr);
      if (!Array.isArray(q) || q.length === 0) return 0;

      let syncedCount = 0;
      for (const item of q) {
        await axiosClient.put('/progress', item);
        syncedCount++;
      }
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
      return syncedCount;
    } catch (err) {
      console.warn('syncOfflineQueue failed, will retry later:', err);
      return 0;
    }
  },

  initOfflineSyncListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.syncOfflineQueue();
      });
      if (navigator.onLine) {
        this.syncOfflineQueue();
      }
    }
  },
};
