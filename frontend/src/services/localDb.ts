import { AudioItem, Category, Tag, SystemStats, ListeningHistoryItem, Episode } from '@/types';
import { formatTime, formatDuration } from '@/lib/utils';

export interface LocalDbSchema {
  systemStats: Partial<SystemStats>;
  categories: Category[];
  tags: Tag[];
  audios: AudioItem[];
  recentHistory: ListeningHistoryItem[];
}

const DB_KEY = 'audio_library_db';

export const isMockAudio = (audio: Partial<AudioItem> | null | undefined): boolean => {
  if (!audio) return false;
  const mockVideoIds = ['dQw4w9WgXcQ', 'k3_tw44QsZQ', 'L_LUpnjgPso', 'fJ9rUzIMcZQ'];
  const mockTitles = [
    'phàm nhân tu tiên',
    'đại phụng đả canh nhân',
    'tri thức vô tận - lịch sử đông nam á',
    'kiếm lai - quyển 04',
  ];
  if (audio.youtubeVideoId && mockVideoIds.includes(audio.youtubeVideoId)) {
    if (audio.title && mockTitles.includes(audio.title.toLowerCase().trim())) {
      return true;
    }
  }
  if (
    (audio.id === 1 && audio.title?.toLowerCase().includes('phàm nhân tu tiên')) ||
    (audio.id === 2 && audio.title?.toLowerCase().includes('đại phụng đả canh nhân')) ||
    (audio.id === 3 && audio.title?.toLowerCase().includes('tri thức vô tận')) ||
    (audio.id === 4 && audio.title?.toLowerCase().includes('kiếm lai'))
  ) {
    return true;
  }
  if ((audio as any).isSample || (audio as any).isMock) {
    return true;
  }
  return false;
};

class LocalDbManager {
  private db: LocalDbSchema | null = null;
  private isLoaded = false;

  async init(): Promise<LocalDbSchema> {
    if (this.isLoaded && this.db) return this.db;

    try {
      const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(DB_KEY) : null;
      if (cached) {
        this.db = JSON.parse(cached);
      } else {
        this.db = { systemStats: {}, categories: [], tags: [], audios: [], recentHistory: [] };
      }
    } catch {
      this.db = { systemStats: {}, categories: [], tags: [], audios: [], recentHistory: [] };
    }
    if (!this.db) {
      this.db = { systemStats: {}, categories: [], tags: [], audios: [], recentHistory: [] };
    }
    if (Array.isArray(this.db.audios)) {
      this.db.audios = this.db.audios.filter((a) => !isMockAudio(a));
    }
    this.isLoaded = true;
    return this.db;
  }

  get(): LocalDbSchema {
    if (!this.db) {
      const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(DB_KEY) : null;
      if (cached) {
        try {
          this.db = JSON.parse(cached);
        } catch {
          this.db = { systemStats: {}, categories: [], tags: [], audios: [], recentHistory: [] };
        }
      } else {
        this.db = { systemStats: {}, categories: [], tags: [], audios: [], recentHistory: [] };
      }
    }
    if (!this.db) {
      this.db = { systemStats: {}, categories: [], tags: [], audios: [], recentHistory: [] };
    }
    if (!this.db.audios) this.db.audios = [];
    if (!this.db.categories) this.db.categories = [];
    if (!this.db.tags) this.db.tags = [];
    if (!this.db.recentHistory) this.db.recentHistory = [];
    if (!this.db.systemStats) this.db.systemStats = {};
    return this.db;
  }

  save() {
    if (this.db && typeof localStorage !== 'undefined') {
      localStorage.setItem(DB_KEY, JSON.stringify(this.db));
    }
  }

  clear() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DB_KEY);
    }
    this.db = null;
    this.isLoaded = false;
  }

  // Helper generators for fallback
  generateEpisodes(totalDuration: number, blockSize: number = 14400, audioId: number = Date.now(), isVip: boolean = false): Episode[] {
    const duration = totalDuration > 0 ? totalDuration : (blockSize > 0 ? blockSize : 3600);
    const count = Math.ceil(duration / blockSize);
    const eps: Episode[] = [];
    for (let i = 0; i < count; i++) {
      const start = i * blockSize;
      const end = Math.min((i + 1) * blockSize, duration);
      eps.push({
        id: Date.now() + i,
        audioId,
        episodeNumber: i + 1,
        title: `Tập ${i + 1} (${formatTime(start)} - ${formatTime(end)})`,
        startSeconds: start,
        endSeconds: end,
        duration: end - start,
        completed: false,
        progressPercent: 0,
        isVip,
      });
    }
    return eps;
  }
}

export const localDb = new LocalDbManager();
