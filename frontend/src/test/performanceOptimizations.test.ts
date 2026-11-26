import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startBackgroundAudio,
  stopBackgroundAudio,
  isBackgroundAudioRunning,
} from '@/lib/backgroundAudioKeeper';
import { audioService, getAudioListMeta } from '@/services/audioService';
import { axiosClient } from '@/lib/axiosClient';

describe('Performance & Power Optimizations', () => {
  const originalWakeLock = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');

  beforeEach(() => {
    stopBackgroundAudio();
    localStorage.clear();
  });

  afterEach(() => {
    stopBackgroundAudio();
    vi.restoreAllMocks();
    if (originalWakeLock) {
      Object.defineProperty(navigator, 'wakeLock', originalWakeLock);
    } else {
      // @ts-expect-error test cleanup
      delete navigator.wakeLock;
    }
  });

  it('stream mode does not spawn silent <audio> anchor or request WakeLock by default', () => {
    const requestWakeLock = vi.fn().mockResolvedValue({ release: vi.fn() });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: requestWakeLock },
    });

    startBackgroundAudio({ engine: 'stream' });

    expect(isBackgroundAudioRunning()).toBe(true);
    expect(document.getElementById('wl-native-audio-anchor')).toBeNull();
    expect(requestWakeLock).not.toHaveBeenCalled();

    stopBackgroundAudio();
    expect(isBackgroundAudioRunning()).toBe(false);
  });

  it('attaches pagination meta from server response via getAudioListMeta without changing array return type', async () => {
    vi.spyOn(axiosClient, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 1,
            youtubeVideoId: 'vid001',
            youtubeUrl: 'https://youtube.com/watch?v=vid001',
            title: 'Sample Audio',
            author: 'Author',
            thumbnailUrl: '',
            totalDurationSeconds: 3600,
            formattedDuration: '1h 00m',
            categoryId: 1,
            categoryName: 'Chung',
            tags: [],
            status: 'ACTIVE',
            isVipOnly: false,
            episodes: [],
          },
        ],
        meta: {
          total: 48,
          page: 2,
          limit: 12,
          totalPages: 4,
        },
      },
    } as never);

    const items = await audioService.getAudios({ page: 2, limit: 12 }, true);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(1);

    const meta = getAudioListMeta(items);
    expect(meta).toEqual({
      total: 48,
      page: 2,
      limit: 12,
      totalPages: 4,
    });
  });
});
