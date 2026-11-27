import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number, forceHour: boolean = false): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 || forceHour ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    if (sec > 0) return `${h}h ${m}m ${sec}s`;
    return `${h}h ${m}m`;
  }
  if (sec > 0) return `${m}m ${sec}s`;
  return `${m} phút`;
}

export function parseDurationToSec(val: string | number | null | undefined, fallbackSec: number = 0): number {
  if (val === null || val === undefined) return fallbackSec;
  if (typeof val === 'number') {
    return val > 0 ? Math.floor(val) : fallbackSec;
  }
  const str = String(val).trim();
  if (!str) return fallbackSec;

  // 1. Dạng HH:MM:SS hoặc MM:SS
  if (str.includes(':')) {
    const parts = str.split(':').map((p) => parseFloat(p.trim()));
    if (parts.every((p) => !isNaN(p))) {
      if (parts.length === 3) {
        return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]);
      }
      if (parts.length === 2) {
        return Math.floor(parts[0] * 60 + parts[1]);
      }
      if (parts.length === 1) {
        return Math.floor(parts[0]);
      }
    }
  }

  // 2. Dạng văn bản có đơn vị: h/giờ/tiếng, m/phút/p, s/giây
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:tiếng|gio|giờ|hours|hour|h)(?!\w)/i);
  const minMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:phút|phut|mins|minute|minutes|p|m)(?!\w)/i);
  const secMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:giây|giay|seconds|second|sec|s)(?!\w)/i);

  if (hourMatch || minMatch || secMatch) {
    let total = 0;
    if (hourMatch) total += parseFloat(hourMatch[1]) * 3600;
    if (minMatch) total += parseFloat(minMatch[1]) * 60;
    if (secMatch) total += parseFloat(secMatch[1]);
    if (total > 0) return Math.floor(total);
  }

  // 3. Chuỗi số nguyên thuần (tính bằng giây)
  const numericOnly = str.match(/^\d+$/);
  if (numericOnly) {
    const parsed = parseInt(str, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return fallbackSec;
}

export function getRemainderThreshold(blockSizeSec: number): number {
  switch (blockSizeSec) {
    case 14400: // 4 giờ
      return 1800; // 30 phút
    case 7200: // 2 giờ
      return 1200; // 20 phút
    case 3600: // 1 giờ
      return 600; // 10 phút
    case 1800: // 30 phút
      return 300; // 5 phút
    default: {
      const thresh = Math.floor(blockSizeSec * 0.2);
      return Math.min(1800, Math.max(300, thresh));
    }
  }
}

export interface ComputedEpisode {
  episodeNumber: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  formattedRange: string;
  formattedHours: string;
}

export function computeLogicalEpisodes(totalDurationSec: number, blockSizeSec: number): ComputedEpisode[] {
  const blockSize = blockSizeSec > 0 ? blockSizeSec : 14400;
  const totalSec = totalDurationSec > 0 ? totalDurationSec : 0;
  if (totalSec <= 0) return [];

  const forceHour = totalSec >= 3600;

  if (totalSec <= blockSize) {
    return [
      {
        episodeNumber: 1,
        title: `Tập 1 (${formatTime(0, forceHour)} - ${formatTime(totalSec, forceHour)})`,
        startSeconds: 0,
        endSeconds: totalSec,
        durationSeconds: totalSec,
        formattedRange: `${formatTime(0, forceHour)} → ${formatTime(totalSec, forceHour)}`,
        formattedHours: `${Math.round((totalSec / 3600) * 10) / 10} giờ`,
      },
    ];
  }

  const fullBlocks = Math.floor(totalSec / blockSize);
  const remainder = totalSec % blockSize;
  const threshold = getRemainderThreshold(blockSize);

  const mergeIntoLast = remainder > 0 && remainder <= threshold;
  const count = remainder > 0 && !mergeIntoLast ? fullBlocks + 1 : fullBlocks;

  const result: ComputedEpisode[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * blockSize;
    const end = i === count - 1 ? totalSec : (i + 1) * blockSize;
    const duration = end - start;
    if (duration <= 0) continue;

    const formattedRange = `${formatTime(start, forceHour)} → ${formatTime(end, forceHour)}`;
    const epHours = Math.round((duration / 3600) * 10) / 10;

    result.push({
      episodeNumber: i + 1,
      title: `Tập ${i + 1} (${formatTime(start, forceHour)} - ${formatTime(end, forceHour)})`,
      startSeconds: start,
      endSeconds: end,
      durationSeconds: duration,
      formattedRange,
      formattedHours: `${epHours} giờ`,
    });
  }

  return result;
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const ytRegex = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const match = url.trim().match(ytRegex);
  return match ? match[1] : null;
}

/**
 * Downsizes oversized YouTube maxresdefault/sddefault thumbnails to hqdefault for small cards
 * to reduce image payload on listing pages without altering hqdefault/mqdefault URLs.
 */
export function getOptimizedThumbnailUrl(
  url?: string | null,
  variant: 'card' | 'hero' = 'card'
): string {
  if (!url) return '/wavelink-icon.png';
  if (variant === 'card') {
    return url.replace(
      /^(https:\/\/(?:img\.youtube\.com|i\.ytimg\.com)\/vi\/[a-zA-Z0-9_-]{11}\/)(?:maxresdefault|sddefault)\.jpg$/i,
      '$1hqdefault.jpg'
    );
  }
  return url;
}
