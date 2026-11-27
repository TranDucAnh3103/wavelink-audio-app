import { ProgressPayload, AudioItem, Episode, ListeningHistoryItem, RecordHistoryPayload } from '@/types';
import { formatTime } from '@/lib/utils';
import { axiosClient } from '@/lib/axiosClient';
import { localDb } from './localDb';

const GUEST_PROGRESS_KEY = 'wavelink_guest_progress';
const GUEST_HISTORY_KEY = 'wavelink_guest_history';

function readGuestStorage(key: string): string | null {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const val = sessionStorage.getItem(key);
      if (val) return val;
    } catch {}
  }
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {}
  }
  return null;
}

function writeGuestStorage(key: string, value: string): void {
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
}

function removeGuestStorage(key: string): void {
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}

export interface StoredGuestProgress extends ProgressPayload {
  updatedAt: number;
}

export const guestSessionService = {
  /**
   * Lưu hoặc cập nhật tiến trình nghe của khách vào cả sessionStorage và localStorage
   * để không bị mất khi hệ điều hành mobile kill tab/app vì thiếu RAM.
   */
  saveGuestProgress(payload: ProgressPayload): void {
    try {
      const raw = readGuestStorage(GUEST_PROGRESS_KEY);
      const map: Record<string, StoredGuestProgress> = raw ? JSON.parse(raw) : {};
      const key = `${payload.audioId}_${payload.episodeId}`;
      map[key] = {
        audioId: Number(payload.audioId),
        episodeId: Number(payload.episodeId),
        positionSeconds: Math.round(payload.positionSeconds),
        progressPercent: Math.min(100, Math.round(payload.progressPercent)),
        completed: Boolean(payload.completed || payload.progressPercent >= 95),
        updatedAt: Date.now(),
      };
      writeGuestStorage(GUEST_PROGRESS_KEY, JSON.stringify(map));
    } catch (err) {
      console.warn('Failed to save guest progress:', err);
    }
  },

  /**
   * Lấy toàn bộ tiến trình nghe của khách (ưu tiên sessionStorage, fallback localStorage sau OS kill).
   */
  getAllGuestProgress(): StoredGuestProgress[] {
    try {
      const raw = readGuestStorage(GUEST_PROGRESS_KEY);
      if (!raw) return [];
      const map: Record<string, StoredGuestProgress> = JSON.parse(raw);
      return Object.values(map);
    } catch {
      return [];
    }
  },

  /**
   * Lấy danh sách tiến trình của một bộ truyện cụ thể.
   */
  getGuestProgressForAudio(audioId: number | string): StoredGuestProgress[] {
    const numId = Number(audioId);
    const all = this.getAllGuestProgress();
    return all.filter((p) => p.audioId === numId);
  },

  /**
   * Gắn tiến trình nghe từ sessionStorage vào một AudioItem (phục vụ hiển thị trên Player và danh sách).
   */
  applyGuestProgressToAudio(audio: AudioItem): AudioItem {
    if (!audio) return audio;
    const progs = this.getGuestProgressForAudio(audio.id);
    if (progs.length === 0) return audio;

    const updatedAudio: AudioItem = { ...audio };
    const updatedEpisodes: Episode[] = audio.episodes ? audio.episodes.map((ep) => ({ ...ep })) : [];

    // Tìm tập nghe có thời điểm cập nhật gần nhất
    let latestProg = progs[0];
    for (const p of progs) {
      if (p.updatedAt > latestProg.updatedAt) {
        latestProg = p;
      }
    }

    // Cập nhật từng tập
    for (const ep of updatedEpisodes) {
      const p = progs.find((item) => item.episodeId === ep.id);
      if (p) {
        ep.progressPercent = p.progressPercent;
        ep.positionSeconds = p.positionSeconds;
        ep.completed = p.completed || p.progressPercent >= 95;
      }
    }
    updatedAudio.episodes = updatedEpisodes;

    // Cập nhật thông số resume của toàn bộ truyện
    const latestEp = updatedEpisodes.find((e) => e.id === latestProg.episodeId);
    updatedAudio.lastPositionSeconds = latestProg.positionSeconds;
    updatedAudio.progressPercent = latestProg.progressPercent;
    updatedAudio.formattedPosition = formatTime(latestProg.positionSeconds);
    if (latestEp) {
      updatedAudio.currentEpisodeId = latestEp.id;
      updatedAudio.currentEpisodeNumber = latestEp.episodeNumber;
      updatedAudio.currentEpisodeTitle = latestEp.title;
    }

    return updatedAudio;
  },

  /**
   * Gắn tiến trình nghe từ sessionStorage vào danh sách AudioItem.
   */
  applyGuestProgressToAudios(audios: AudioItem[]): AudioItem[] {
    if (!Array.isArray(audios)) return [];
    return audios.map((a) => this.applyGuestProgressToAudio(a));
  },

  /**
   * Lưu phiên nghe vào lịch sử của khách trong sessionStorage.
   */
  saveGuestHistory(
    payload: RecordHistoryPayload,
    currentAudio?: AudioItem | null,
    currentEpisode?: Episode | null
  ): void {
    try {
      const history = this.getGuestHistory();
      const audioId = Number(payload.audioId);
      const episodeId = Number(payload.episodeId);

      // 1. Phục hồi AudioItem nếu bị khuyết hoặc truyền thiếu
      let resolvedAudio = payload.audio || currentAudio;
      if (!resolvedAudio || !resolvedAudio.title || resolvedAudio.title === 'Truyện Audio') {
        const db = localDb.get();
        const found = db.audios?.find((a) => Number(a.id) === audioId);
        if (found) resolvedAudio = found;
      }

      // 2. Phục hồi Episode nếu bị khuyết
      let resolvedEpisode = payload.episode || currentEpisode;
      if (!resolvedEpisode && resolvedAudio?.episodes) {
        resolvedEpisode = resolvedAudio.episodes.find((e) => Number(e.id) === episodeId) || null;
      }

      // 3. Lấy vị trí thời gian và phần trăm nghe chính xác
      const pos =
        payload.positionSeconds !== undefined
          ? payload.positionSeconds
          : resolvedEpisode?.positionSeconds || 0;

      const dur =
        resolvedEpisode?.duration ||
        (resolvedEpisode ? resolvedEpisode.endSeconds - resolvedEpisode.startSeconds : 0) ||
        resolvedAudio?.totalDurationSeconds ||
        14400;

      const percent =
        payload.progressPercent !== undefined
          ? payload.progressPercent
          : resolvedEpisode?.progressPercent || Math.min(100, Math.round((pos / dur) * 100));

      const epTitle = resolvedEpisode?.title || (payload.episode ? payload.episode.title : 'Tập 1');
      const epNum = resolvedEpisode?.episodeNumber || (payload.episode ? payload.episode.episodeNumber : 1);
      const listenedDuration = Math.round(payload.durationListened || pos || 60);
      const totalListened = Math.round(payload.totalDurationListened || listenedDuration);

      const newItem: ListeningHistoryItem = {
        id: Date.now(),
        audioId,
        episodeId,
        title: resolvedAudio?.title || 'Truyện Audio',
        currentEpisodeId: episodeId,
        currentEpisodeNumber: epNum,
        currentEpisodeTitle: epTitle,
        episodeTitle: epTitle,
        thumbnailUrl: resolvedAudio?.thumbnailUrl || '',
        lastPositionSeconds: pos,
        formattedPosition: formatTime(pos),
        progressPercent: percent,
        durationListened: listenedDuration,
        totalDurationListened: totalListened,
        createdAt: new Date().toISOString(),
      };

      // Đảm bảo mỗi AudioID chỉ xuất hiện 1 mục mới nhất trong lịch sử
      const filtered = history.filter((h) => h.audioId !== audioId);
      filtered.unshift(newItem);

      writeGuestStorage(GUEST_HISTORY_KEY, JSON.stringify(filtered.slice(0, 100)));
    } catch (err) {
      console.warn('Failed to save guest history:', err);
    }
  },

  /**
   * Lấy danh sách lịch sử nghe của khách từ sessionStorage/localStorage.
   */
  getGuestHistory(): ListeningHistoryItem[] {
    try {
      const raw = readGuestStorage(GUEST_HISTORY_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  /**
   * Xóa sạch dữ liệu tạm của khách (gọi sau khi đã di chuyển vào DB hoặc đăng xuất).
   */
  clearGuestSession(): void {
    removeGuestStorage(GUEST_PROGRESS_KEY);
    removeGuestStorage(GUEST_HISTORY_KEY);
  },

  /**
   * Kiểm tra khách có dữ liệu nghe dở trong session hay không.
   */
  hasGuestData(): boolean {
    return this.getAllGuestProgress().length > 0 || this.getGuestHistory().length > 0;
  },

  /**
   * Di chuyển toàn bộ tiến trình và lịch sử thao tác của khách trong sessionStorage vào database của người dùng.
   */
  async migrateGuestSessionToUser(): Promise<{ progressCount: number; historyCount: number }> {
    const progressList = this.getAllGuestProgress();
    const historyList = this.getGuestHistory();

    if (progressList.length === 0 && historyList.length === 0) {
      return { progressCount: 0, historyCount: 0 };
    }

    let progressCount = 0;
    let historyCount = 0;

    // 1. Đồng bộ tiến trình nghe lên DB (thử gọi batch trước, nếu lỗi thì fallback từng mục)
    if (progressList.length > 0) {
      try {
        const batchItems = progressList.map((p) => ({
          audioId: p.audioId,
          episodeId: p.episodeId,
          positionSeconds: p.positionSeconds,
          progressPercent: p.progressPercent,
          completed: p.completed,
        }));
        await axiosClient.put('/progress/batch', { items: batchItems });
        progressCount = batchItems.length;
      } catch {
        // Fallback từng mục
        for (const p of progressList) {
          try {
            await axiosClient.put('/progress', {
              audioId: p.audioId,
              episodeId: p.episodeId,
              positionSeconds: p.positionSeconds,
              progressPercent: p.progressPercent,
              completed: p.completed,
            });
            progressCount++;
          } catch (err) {
            console.warn('Failed to migrate progress item:', p, err);
          }
        }
      }
    }

    // 2. Đồng bộ lịch sử nghe lên DB (thử gọi batch trước, fallback từng mục)
    if (historyList.length > 0) {
      try {
        const batchHistoryItems = historyList.map((h) => ({
          audioId: h.audioId,
          episodeId: h.episodeId,
          durationListened: h.durationListened || 60,
        }));
        await axiosClient.post('/history/batch', { items: batchHistoryItems });
        historyCount = batchHistoryItems.length;
      } catch {
        for (const h of historyList) {
          try {
            await axiosClient.post('/history', {
              audioId: h.audioId,
              episodeId: h.episodeId,
              durationListened: h.durationListened || 60,
            });
            historyCount++;
          } catch (err) {
            console.warn('Failed to migrate history item:', h, err);
          }
        }
      }
    }

    // 3. Xóa dữ liệu tạm trong sessionStorage sau khi đã đồng bộ thành công vào DB
    this.clearGuestSession();

    return { progressCount, historyCount };
  },
};
