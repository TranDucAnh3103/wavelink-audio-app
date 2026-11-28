import { axiosClient } from '@/lib/axiosClient';
import { Episode } from '@/types';
import { localDb } from './localDb';

export const episodeService = {
  async getEpisodes(audioId: number | string, isLive = true): Promise<Episode[]> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: Episode[] }>(`/audios/${audioId}/episodes`);
        if (res.data.success && Array.isArray(res.data.data)) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('getEpisodes live API failed, fallback to local', err);
      }
    }

    const db = localDb.get();
    const audio = db.audios.find((a) => String(a.id) === String(audioId));
    return audio?.episodes || [];
  },

  async generateEpisodes(
    audioId: number | string,
    blockSizeSeconds: number = 14400,
    durationSeconds: number = 0,
    isLive = true
  ): Promise<Episode[]> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data: Episode[] }>(
        `/audios/${audioId}/episodes/generate`,
        { blockSizeSeconds, durationSeconds }
      );
      if (res.data.success && Array.isArray(res.data.data)) {
        return res.data.data;
      }
      throw new Error('Không thể chia tập tự động');
    }

    const db = localDb.get();
    const audio = db.audios.find((a) => String(a.id) === String(audioId));
    if (audio) {
      const total = durationSeconds > 0 ? durationSeconds : audio.totalDurationSeconds;
      const eps = localDb.generateEpisodes(total, blockSizeSeconds, audio.id);
      audio.episodes = eps;
      audio.totalEpisodes = eps.length;
      localDb.save();
      return eps;
    }
    return [];
  },

  async updateEpisode(id: number | string, data: Partial<Episode>, isLive = true): Promise<boolean> {
    if (isLive) {
      const res = await axiosClient.put<{ success: boolean }>(`/episodes/${id}`, data);
      if (res.data.success) return true;
      throw new Error('Không thể cập nhật tập');
    }

    const db = localDb.get();
    for (const a of db.audios) {
      const ep = a.episodes?.find((e) => String(e.id) === String(id));
      if (ep) {
        Object.assign(ep, data);
        ep.duration = ep.endSeconds - ep.startSeconds;
        localDb.save();
        return true;
      }
    }
    return false;
  },

  async deleteEpisode(id: number | string, isLive = true): Promise<boolean> {
    if (isLive) {
      const res = await axiosClient.delete<{ success: boolean }>(`/episodes/${id}`);
      if (res.data.success) return true;
      throw new Error('Không thể xóa tập');
    }

    const db = localDb.get();
    for (const a of db.audios) {
      if (a.episodes) {
        a.episodes = a.episodes.filter((e) => String(e.id) !== String(id));
        a.totalEpisodes = a.episodes.length;
        localDb.save();
        return true;
      }
    }
    return false;
  },

  async createEpisode(data: Partial<Episode> & { audioId: number }, isLive = true): Promise<Episode | null> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data: Episode }>('/episodes', data);
      if (res.data.success && res.data.data) {
        return res.data.data;
      }
      throw new Error('Không thể tạo tập mới');
    }

    const db = localDb.get();
    const audio = db.audios.find((a) => a.id === data.audioId);
    if (audio) {
      if (!audio.episodes) audio.episodes = [];
      const newEp: Episode = {
        id: Date.now(),
        audioId: data.audioId,
        episodeNumber: data.episodeNumber || audio.episodes.length + 1,
        title: data.title || `Tập ${audio.episodes.length + 1}`,
        startSeconds: data.startSeconds || 0,
        endSeconds: data.endSeconds || 14400,
        duration: (data.endSeconds || 14400) - (data.startSeconds || 0),
        completed: false,
        progressPercent: 0,
      };
      audio.episodes.push(newEp);
      audio.totalEpisodes = audio.episodes.length;
      localDb.save();
      return newEp;
    }
    return null;
  },
};
