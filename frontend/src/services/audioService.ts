import { axiosClient } from '@/lib/axiosClient';
import { AudioItem, AudioFilter, YouTubePreviewData, ImportYouTubePayload, ImportResult, ImportQuota, User } from '@/types';
import { localDb } from './localDb';
import { extractYouTubeId, formatTime, formatDuration } from '@/lib/utils';
import { guestSessionService } from './guestSessionService';
import { useAuthStore } from '@/stores/authStore';

export const audioService = {
  async getAudios(filter: AudioFilter = {}, isLive = true, currentUserId?: number): Promise<AudioItem[]> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;

    if (isLive) {
      try {
        const params = new URLSearchParams();
        if (filter.search) params.append('search', filter.search);
        if (filter.categoryId) params.append('categoryId', String(filter.categoryId));
        if (filter.status) params.append('status', filter.status);
        if (filter.tag) params.append('tag', filter.tag);
        if (filter.page) params.append('page', String(filter.page));
        if (filter.limit || filter.pageSize) {
          params.append('limit', String(filter.limit || filter.pageSize));
        } else if (!filter.page) {
          // Khi lấy toàn bộ danh sách để client-side phân trang (hoặc thư viện):
          // Chỉ định rõ all=true và limit=0 để không bị giới hạn mặc định ở 20 bản ghi
          params.append('all', 'true');
          params.append('limit', '0');
        }
        if (filter.my || filter.status === 'my') params.append('status', 'my');
        if (filter.userId) params.append('userId', String(filter.userId));
        else if (filter.createdBy) params.append('createdBy', String(filter.createdBy));
        if (filter.sort) params.append('sort', filter.sort);

        const res = await axiosClient.get<{ success: boolean; data: AudioItem[] }>(`/audios?${params.toString()}`);
        if (res.data.success && Array.isArray(res.data.data)) {
          const map = new Map<number | string, AudioItem>();
          for (const item of res.data.data) {
            if (!map.has(item.id)) map.set(item.id, item);
          }
          let list = Array.from(map.values());

          // Nếu là khách (chưa đăng nhập): ghép tiến trình từ sessionStorage
          if (!token) {
            list = guestSessionService.applyGuestProgressToAudios(list);
            if (filter.status === 'listening') {
              list = list.filter((a) => (a.progressPercent || 0) > 0 && (a.progressPercent || 0) < 95);
            } else if (filter.status === 'completed') {
              list = list.filter((a) => (a.progressPercent || 0) >= 95);
            }
          }

          return list;
        }
      } catch (err) {
        console.warn('getAudios live API failed, fallback to local', err);
      }
    }

    // Local DB fallback
    const db = localDb.get();
    let list = [...(db.audios || [])];

    if (!token) {
      list = guestSessionService.applyGuestProgressToAudios(list);
    }

    if (filter.status === 'my' || filter.my) {
      list = list.filter((a) => a.createdBy && a.createdBy === currentUserId);
    }
    if (filter.userId || filter.createdBy) {
      const targetUID = String(filter.userId || filter.createdBy);
      list = list.filter((a) => a.createdBy && String(a.createdBy) === targetUID);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          (a.tags && a.tags.some((t) => t.toLowerCase().includes(q))) ||
          (a.youtubeVideoId && a.youtubeVideoId.toLowerCase().includes(q))
      );
    }
    if (filter.categoryId) {
      list = list.filter((a) => a.categoryId === filter.categoryId);
    }
    if (filter.tag) {
      list = list.filter((a) => a.tags && a.tags.includes(filter.tag!));
    }
    if (filter.status === 'listening') {
      list = list.filter((a) => (a.progressPercent || 0) > 0 && (a.progressPercent || 0) < 95);
    } else if (filter.status === 'completed') {
      list = list.filter((a) => (a.progressPercent || 0) >= 95);
    } else if (filter.status === 'favorite') {
      list = list.filter((a) => a.isFavorite);
    }

    if (filter.sort === 'popular') {
      list.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    } else {
      list.sort((a, b) => Number(b.id) - Number(a.id));
    }

    const seenIds = new Set<number | string>();
    return list.filter((a) => {
      if (seenIds.has(a.id)) return false;
      seenIds.add(a.id);
      return true;
    });
  },

  async getAudioById(id: number | string, isLive = true): Promise<AudioItem | null> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const user = useAuthStore.getState().user;
    const isVipOrAdmin = user?.role === 'VIP' || user?.role === 'ADMIN' || user?.membership === 'VIP';

    const enrichAudioEpisodes = (audioItem: AudioItem): AudioItem => {
      if (audioItem.episodes && audioItem.episodes.length > 0) {
        const isVipAudio = Boolean(audioItem.isVIPOnly || audioItem.isVipOnly);
        const freeLimit = audioItem.freeEpisodesCount !== undefined ? audioItem.freeEpisodesCount : 1;
        audioItem.episodes = audioItem.episodes.map((ep) => {
          const epIsVip = isVipAudio || Boolean(ep.isVip);
          const isLocked = epIsVip && !isVipOrAdmin && (ep.episodeNumber > freeLimit || freeLimit === 0);
          return {
            ...ep,
            isVip: epIsVip,
            isLocked,
          };
        });
      }
      return audioItem;
    };

    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: AudioItem }>(`/audios/${id}`);
        if (res.data.success && res.data.data) {
          let item = res.data.data;
          if (!token) {
            item = guestSessionService.applyGuestProgressToAudio(item);
          }
          return enrichAudioEpisodes(item);
        }
      } catch (err) {
        console.warn('getAudioById live API failed, fallback to local', err);
      }
    }

    const db = localDb.get();
    let item = db.audios.find((a) => String(a.id) === String(id));
    if (item && !token) {
      item = guestSessionService.applyGuestProgressToAudio(item);
    }
    return item ? enrichAudioEpisodes(item) : null;
  },

  async updateAudio(id: number | string, data: Partial<AudioItem>, isLive = true): Promise<AudioItem | null> {
    if (isLive) {
      try {
        const res = await axiosClient.put<{ success: boolean; data: AudioItem }>(`/audios/${id}`, data);
        if (res.data.success && res.data.data) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('updateAudio live API failed, fallback to local', err);
      }
    }

    const db = localDb.get();
    const audio = db.audios.find((a) => String(a.id) === String(id));
    if (audio) {
      Object.assign(audio, data);
      if (data.isVipOnly !== undefined || data.isVIPOnly !== undefined) {
        const flag = Boolean(data.isVipOnly || data.isVIPOnly);
        audio.isVIPOnly = flag;
        audio.isVipOnly = flag;
        if (audio.episodes) {
          audio.episodes = audio.episodes.map((ep) => ({
            ...ep,
            isVip: flag,
          }));
        }
      }
      localDb.save();
      return audio;
    }
    return null;
  },

  async deleteAudio(id: number | string, isLive = true): Promise<boolean> {
    if (isLive) {
      try {
        const res = await axiosClient.delete<{ success: boolean }>(`/audios/${id}`);
        if (res.data.success) return true;
      } catch (err) {
        console.warn('deleteAudio live API failed, fallback to local', err);
      }
    }

    const db = localDb.get();
    db.audios = db.audios.filter((a) => String(a.id) !== String(id));
    localDb.save();
    return true;
  },

  async refreshAudio(id: number | string, isLive = true): Promise<AudioItem | null> {
    if (isLive) {
      try {
        const res = await axiosClient.post<{ success: boolean; data: AudioItem }>(`/audios/${id}/refresh`);
        if (res.data.success && res.data.data) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('refreshAudio live API failed', err);
      }
    }
    return this.getAudioById(id, isLive);
  },

  async toggleFavorite(audioId: number | string, isLive = true): Promise<boolean> {
    if (isLive) {
      try {
        const res = await axiosClient.post<{ success: boolean; data: { isFavorite: boolean } }>(
          `/favorites/${audioId}/toggle`
        );
        if (res.data.success && res.data.data) {
          return res.data.data.isFavorite;
        }
      } catch (err) {
        console.warn('toggleFavorite live API failed', err);
      }
    }

    const db = localDb.get();
    const audio = db.audios.find((a) => String(a.id) === String(audioId));
    if (audio) {
      audio.isFavorite = !audio.isFavorite;
      localDb.save();
      return audio.isFavorite;
    }
    return false;
  },

  async previewYouTube(url: string, isLive = true): Promise<YouTubePreviewData | null> {
    const videoId = extractYouTubeId(url);
    if (!videoId) return null;

    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: Partial<YouTubePreviewData>; error?: { message?: string } }>(
          `/audios/preview-youtube?url=${encodeURIComponent(url)}`
        );
        if (res.data.success && res.data.data && res.data.data.title) {
          return {
            videoId: res.data.data.videoId || videoId,
            title: res.data.data.title,
            author: res.data.data.author || 'YouTube Creator',
            durationSeconds: res.data.data.durationSeconds || 0,
            formattedDuration: res.data.data.formattedDuration || '',
            thumbnailUrl: res.data.data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          };
        }
      } catch (err: unknown) {
        const apiErr = err as { status?: number; message?: string };
        if (apiErr.status === 400 || (apiErr.message && (apiErr.message.includes('không tồn tại') || apiErr.message.includes('không thể phát')))) {
          throw err;
        }
        console.warn('previewYouTube live backend failed, fallback to noembed', err);
      }
    }

    try {
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.title && !json.error) {
          return {
            videoId,
            title: json.title,
            author: json.author_name || 'YouTube Creator',
            durationSeconds: 0,
            formattedDuration: '',
            thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          };
        }
      }
    } catch {
      // Ignore
    }

    // Tuyệt đối cấm trả về dummy data cho link không tồn tại hoặc link rác
    throw new Error('Video YouTube không tồn tại, ở chế độ riêng tư hoặc không thể phát');
  },

  async importYouTube(payload: ImportYouTubePayload, isLive = true, currentUserId?: number): Promise<ImportResult> {
    const videoId = extractYouTubeId(payload.url);
    if (!videoId) throw new Error('URL YouTube không hợp lệ!');

    const duration = payload.durationSeconds && payload.durationSeconds > 0 ? payload.durationSeconds : 0;
    const blockSize = payload.blockSizeSeconds || 14400;

    if (isLive) {
      try {
        const res = await axiosClient.post<{
          success: boolean;
          data: { audio?: AudioItem; duplicate?: boolean } | AudioItem;
          error?: { message?: string };
        }>('/audios/import-youtube', {
          url: payload.url,
          categoryId: payload.categoryId,
          tags: payload.tags || [],
          durationSeconds: duration,
          blockSizeSeconds: blockSize,
          isVipOnly: payload.isVipOnly,
        });

        if (res.data.success) {
          const raw = res.data.data as Record<string, unknown>;
          const audio = (raw.audio || raw) as AudioItem;
          const duplicate = Boolean(raw.duplicate);

          if (audio && audio.id) {
            const db = localDb.get();
            const exists = db.audios.find((a) => a.id === audio.id);
            if (!exists) {
              db.audios.unshift(audio);
              localDb.save();
            }
          }
          return { duplicate, audio };
        } else {
          throw new Error(res.data.error?.message || 'Lỗi nhập URL YouTube');
        }
      } catch (err: unknown) {
        const apiErr = err as { status?: number; message?: string };
        if (apiErr.status === 400 || (apiErr.message && (apiErr.message.includes('không tồn tại') || apiErr.message.includes('không thể phát')))) {
          throw err;
        }
        const msg = (err as Error).message;
        console.warn('importYouTube live API error, fallback to local:', err);
        if (msg && !msg.includes('Network Error') && !msg.includes('timeout')) throw err;
      }
    }

    // Local fallback
    const user = useAuthStore.getState().user;
    const isVipOrAdmin = user?.role === 'VIP' || user?.role === 'ADMIN' || user?.membership === 'VIP';

    if (!isVipOrAdmin && user && !user.isGuest) {
      const todayStr = new Date().toISOString().split('T')[0];
      const quotaKey = `yt_import_quota_${user.id}`;
      let count = 0;
      try {
        const saved = localStorage.getItem(quotaKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.date === todayStr) {
            count = Number(parsed.count) || 0;
          }
        }
      } catch {}

      if (count >= 5) {
        throw new Error('Bạn đã dùng hết lượt nhập link miễn phí hôm nay (5 lượt/ngày). Vui lòng nâng cấp VIP để không giới hạn.');
      }

      localStorage.setItem(quotaKey, JSON.stringify({ date: todayStr, count: count + 1 }));
    }

    const db = localDb.get();
    const exists = db.audios.find((a) => a.youtubeVideoId === videoId);
    if (exists) {
      return { duplicate: true, audio: exists };
    }

    let preview: YouTubePreviewData | null = null;
    try {
      preview = await this.previewYouTube(payload.url, isLive);
    } catch (err) {
      if (duration > 0) {
        preview = {
          videoId,
          title: 'Audio mới nhập - ' + videoId,
          author: 'YouTube Creator',
          durationSeconds: duration,
          formattedDuration: formatDuration(duration),
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        };
      } else {
        throw err;
      }
    }

    if (!preview) {
      throw new Error('Video YouTube không tồn tại hoặc không thể phát');
    }

    const finalDuration = duration > 0 ? duration : (preview.durationSeconds > 0 ? preview.durationSeconds : (payload.blockSizeSeconds || 14400));
    const cat = db.categories.find((c) => c.id === payload.categoryId) || { id: 1, name: 'Tiên hiệp', slug: 'tien-hiep' };
    const isVip = Boolean(payload.isVipOnly);
    const rawEpisodes = localDb.generateEpisodes(finalDuration, blockSize, Date.now(), isVip);
    const totalEps = rawEpisodes.length;
    const episodes = rawEpisodes.map((ep) => {
      return {
        ...ep,
        isVip,
        isLocked: isVip && !isVipOrAdmin && ep.episodeNumber > 1,
      };
    });

    const newAudio: AudioItem = {
      id: Date.now(),
      youtubeVideoId: videoId,
      youtubeUrl: payload.url,
      title: preview.title,
      author: preview.author,
      channel: preview.author,
      categoryId: cat.id,
      categoryName: cat.name,
      tags: payload.tags.length ? payload.tags : ['Audiobook', 'Tu tiên'],
      thumbnailUrl: preview.thumbnailUrl,
      totalDurationSeconds: finalDuration,
      formattedDuration: formatDuration(finalDuration),
      totalEpisodes: episodes.length,
      status: 'ACTIVE',
      currentEpisodeNumber: 1,
      currentEpisodeTitle: episodes[0]?.title || 'Tập 1',
      lastPositionSeconds: 0,
      formattedPosition: '00:00:00',
      progressPercent: 0,
      isFavorite: false,
      isVIPOnly: payload.isVipOnly,
      isVipOnly: payload.isVipOnly,
      createdBy: currentUserId || user?.id,
      episodes,
    };

    db.audios.unshift(newAudio);
    if (db.systemStats.totalAudios) db.systemStats.totalAudios++;
    localDb.save();

    return { duplicate: false, audio: newAudio };
  },

  async getImportQuota(isLive = true, currentUser?: User | null): Promise<ImportQuota> {
    const user = currentUser || useAuthStore.getState().user;

    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: ImportQuota }>('/audios/quota');
        if (res.data.success && res.data.data) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('getImportQuota live API failed, fallback to local', err);
      }
    }

    if (!user || user.isGuest || user.role === 'GUEST') {
      return {
        isGuest: true,
        isVipOrAdmin: false,
        todayImportCount: 0,
        maxImportsPerDay: 5,
        remaining: 0,
        canImport: false,
        reason: 'Khách vãng lai không thể nhập link. Vui lòng đăng nhập hoặc nâng cấp tài khoản.',
      };
    }

    const isVipOrAdmin = user.role === 'VIP' || user.role === 'ADMIN' || user.membership === 'VIP';
    if (isVipOrAdmin) {
      return {
        isGuest: false,
        isVipOrAdmin: true,
        todayImportCount: 0,
        maxImportsPerDay: 5,
        remaining: 999999,
        canImport: true,
      };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const quotaKey = `yt_import_quota_${user.id}`;
    let count = 0;
    try {
      const saved = localStorage.getItem(quotaKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === todayStr) {
          count = Number(parsed.count) || 0;
        }
      }
    } catch {}

    const remaining = Math.max(0, 5 - count);
    return {
      isGuest: false,
      isVipOrAdmin: false,
      todayImportCount: count,
      maxImportsPerDay: 5,
      remaining,
      canImport: count < 5,
      reason: count >= 5 ? 'Bạn đã dùng hết lượt nhập link miễn phí hôm nay (5 lượt/ngày).' : undefined,
    };
  },
};
