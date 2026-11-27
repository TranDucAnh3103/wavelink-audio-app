import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDuration,
  formatVND,
  extractYouTubeId,
  parseDurationToSec,
  computeLogicalEpisodes,
  getOptimizedThumbnailUrl,
  handleImageFallback,
} from '@/lib/utils';

describe('Utility Functions', () => {
  describe('formatTime', () => {
    it('formats seconds into mm:ss when under an hour', () => {
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(65)).toBe('01:05');
      expect(formatTime(3599)).toBe('59:59');
    });

    it('formats seconds into hh:mm:ss when over an hour or forced', () => {
      expect(formatTime(3600)).toBe('01:00:00');
      expect(formatTime(3665)).toBe('01:01:05');
      expect(formatTime(14400)).toBe('04:00:00');
      expect(formatTime(0, true)).toBe('00:00:00');
    });
  });

  describe('formatDuration', () => {
    it('formats minutes and hours appropriately', () => {
      expect(formatDuration(1800)).toBe('30 phút');
      expect(formatDuration(3600)).toBe('1h 0m');
      expect(formatDuration(14400)).toBe('4h 0m');
      expect(formatDuration(99480)).toBe('27h 38m');
      expect(formatDuration(15022)).toBe('4h 10m 22s');
      expect(formatDuration(36982)).toBe('10h 16m 22s');
    });
  });

  describe('parseDurationToSec', () => {
    it('correctly parses Vietnamese and international duration strings', () => {
      expect(parseDurationToSec('10h 16m 22s')).toBe(36982);
      expect(parseDurationToSec('10h 16m')).toBe(36960);
      expect(parseDurationToSec('4 giờ 10 phút 22 giây')).toBe(15022);
      expect(parseDurationToSec('04:10:22')).toBe(15022);
      expect(parseDurationToSec('10:16')).toBe(616);
      expect(parseDurationToSec('15022')).toBe(15022);
      expect(parseDurationToSec('4h')).toBe(14400);
      expect(parseDurationToSec('30m')).toBe(1800);
      expect(parseDurationToSec('', 5000)).toBe(5000);
    });
  });

  describe('computeLogicalEpisodes', () => {
    it('merges small remainder into the last episode (4h 10m 22s -> 1 episode)', () => {
      const episodes = computeLogicalEpisodes(15022, 14400);
      expect(episodes).toHaveLength(1);
      expect(episodes[0].startSeconds).toBe(0);
      expect(episodes[0].endSeconds).toBe(15022);
      expect(episodes[0].durationSeconds).toBe(15022);
      expect(episodes[0].formattedRange).toBe('00:00:00 → 04:10:22');
    });

    it('merges small remainder into episode 2 for 8h 10m 22s', () => {
      const episodes = computeLogicalEpisodes(29422, 14400);
      expect(episodes).toHaveLength(2);
      expect(episodes[0].startSeconds).toBe(0);
      expect(episodes[0].endSeconds).toBe(14400);
      expect(episodes[1].startSeconds).toBe(14400);
      expect(episodes[1].endSeconds).toBe(29422);
      expect(episodes[1].durationSeconds).toBe(15022);
      expect(episodes[1].formattedRange).toBe('04:00:00 → 08:10:22');
    });

    it('splits into 3 episodes when remainder is large (10h 16m with 4h block)', () => {
      const episodes = computeLogicalEpisodes(36960, 14400);
      expect(episodes).toHaveLength(3);
      expect(episodes[0].durationSeconds).toBe(14400);
      expect(episodes[1].durationSeconds).toBe(14400);
      expect(episodes[2].durationSeconds).toBe(8160);
      expect(episodes[2].endSeconds).toBe(36960);
    });

    it('creates 1 episode when audio is shorter than block size', () => {
      const episodes = computeLogicalEpisodes(7200, 14400);
      expect(episodes).toHaveLength(1);
      expect(episodes[0].durationSeconds).toBe(7200);
    });
  });

  describe('extractYouTubeId', () => {
    it('extracts videoId from standard watch URL', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts videoId from youtu.be short URL', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts videoId from embed or shorts URL', () => {
      expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('returns null for invalid URLs', () => {
      expect(extractYouTubeId('https://google.com')).toBeNull();
      expect(extractYouTubeId('')).toBeNull();
    });
  });

  describe('formatVND', () => {
    it('formats numbers into Vietnamese currency style', () => {
      const formatted = formatVND(49000);
      expect(formatted).toContain('49.000');
    });
  });

  describe('getOptimizedThumbnailUrl', () => {
    const ytWithQuery =
      'https://i.ytimg.com/vi/2H8BptZ6PgU/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLD_G';

    it('rewrites YouTube JPEG URLs (with query params) to vi_webp sizes per variant', () => {
      expect(getOptimizedThumbnailUrl(ytWithQuery, 'card')).toBe(
        'https://i.ytimg.com/vi_webp/2H8BptZ6PgU/mqdefault.webp'
      );
      expect(getOptimizedThumbnailUrl(ytWithQuery, 'avatar')).toBe(
        'https://i.ytimg.com/vi_webp/2H8BptZ6PgU/default.webp'
      );
      expect(getOptimizedThumbnailUrl(ytWithQuery, 'hero')).toBe(
        'https://i.ytimg.com/vi_webp/2H8BptZ6PgU/hqdefault.webp'
      );
    });

    it('rewrites img.youtube.com URLs cleanly and keeps non-YouTube URLs untouched', () => {
      expect(
        getOptimizedThumbnailUrl('https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', 'card')
      ).toBe('https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/mqdefault.webp');
      expect(getOptimizedThumbnailUrl('https://example.com/cover.png', 'card')).toBe(
        'https://example.com/cover.png'
      );
      expect(getOptimizedThumbnailUrl(null, 'card')).toBe('/wavelink-icon.png');
    });
  });

  describe('handleImageFallback', () => {
    it('falls back to original URL first and then to local icon on second failure', () => {
      const img = {
        src: 'https://i.ytimg.com/vi_webp/2H8BptZ6PgU/mqdefault.webp',
        dataset: {} as Record<string, string>,
      } as unknown as HTMLImageElement;

      handleImageFallback({ currentTarget: img }, 'https://i.ytimg.com/vi/2H8BptZ6PgU/hq720.jpg');
      expect(img.src).toBe('https://i.ytimg.com/vi/2H8BptZ6PgU/hq720.jpg');
      expect(img.dataset.fallbackStage).toBe('original');

      handleImageFallback({ currentTarget: img }, 'https://i.ytimg.com/vi/2H8BptZ6PgU/hq720.jpg');
      expect(img.src).toBe('/wavelink-icon.png');
      expect(img.dataset.fallbackStage).toBe('icon');
    });
  });
});
