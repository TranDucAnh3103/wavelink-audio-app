import { axiosClient } from '@/lib/axiosClient';
import { ListeningHistoryItem, RecordHistoryPayload } from '@/types';
import { localDb } from './localDb';
import { guestSessionService } from './guestSessionService';
import { usePlayerStore } from '@/stores/playerStore';

export const historyService = {
  async getRecentHistory(isLive = true): Promise<ListeningHistoryItem[]> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;

    // Nếu chưa đăng nhập / là khách: lấy lịch sử từ sessionStorage
    if (!token) {
      return guestSessionService.getGuestHistory();
    }

    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: ListeningHistoryItem[] }>('/history');
        if (res.data.success && Array.isArray(res.data.data)) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('getRecentHistory live API failed', err);
      }
    }

    const db = localDb.get();
    return db.recentHistory || [];
  },

  async recordHistory(payload: RecordHistoryPayload, isLive = true): Promise<void> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;

    // Nếu chưa đăng nhập / là khách: lưu vào sessionStorage, không lưu DB
    if (!token) {
      const state = usePlayerStore.getState();
      const activeAudio =
        payload.audio ||
        (state.currentAudio && Number(state.currentAudio.id) === Number(payload.audioId)
          ? state.currentAudio
          : null);
      const activeEpisode =
        payload.episode ||
        (state.currentEpisode && Number(state.currentEpisode.id) === Number(payload.episodeId)
          ? state.currentEpisode
          : null);
      guestSessionService.saveGuestHistory(payload, activeAudio, activeEpisode);
      return;
    }

    if (isLive) {
      try {
        await axiosClient.post('/history', {
          audioId: Number(payload.audioId),
          episodeId: Number(payload.episodeId),
          durationListened: Math.round(payload.durationListened),
        });
      } catch (err) {
        console.warn('recordHistory live API failed', err);
      }
    }
  },
};
