import { api } from '@/services/api';
import { extractYouTubeId, formatTime } from '@/lib/utils';
import { AudioItem, Episode } from '@/types';

export interface MappedEpisodePosition {
  episode: Episode;
  positionSeconds: number;
  absoluteSeconds: number;
  episodeDuration: number;
  progressPercent: number;
  formattedAbsolute: string;
  formattedEpisodePos: string;
}

/**
 * Parses a YouTube timestamp value (e.g. "33825", "33825s", "1h23m45s", "23m45s", "09:23:45", "45:30")
 * into non-negative integer seconds, or null if invalid.
 */
export function parseYouTubeTimestampValue(raw: string): number | null {
  const str = (raw || '').trim();
  if (!str) return null;

  // 1. Plain integer seconds (optionally trailing 's')
  const plainSec = str.match(/^(\d+)s?$/i);
  if (plainSec) {
    const val = parseInt(plainSec[1], 10);
    return Number.isFinite(val) && val >= 0 ? val : null;
  }

  // 2. Colon-separated HH:MM:SS or MM:SS
  if (str.includes(':')) {
    const parts = str.split(':').map((p) => p.trim());
    if ((parts.length === 2 || parts.length === 3) && parts.every((p) => /^\d+$/.test(p))) {
      const nums = parts.map((p) => parseInt(p, 10));
      if (nums.length === 3) {
        return nums[0] * 3600 + nums[1] * 60 + nums[2];
      }
      return nums[0] * 60 + nums[1];
    }
    return null;
  }

  // 3. YouTube HMS format: e.g. 1h23m45s, 23m45s, 1h2m
  const hmsMatch = str.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (hmsMatch && (hmsMatch[1] !== undefined || hmsMatch[2] !== undefined || hmsMatch[3] !== undefined)) {
    const hasUnit = /[hms]/i.test(str);
    if (!hasUnit) return null;
    const h = hmsMatch[1] ? parseInt(hmsMatch[1], 10) : 0;
    const m = hmsMatch[2] ? parseInt(hmsMatch[2], 10) : 0;
    const s = hmsMatch[3] ? parseInt(hmsMatch[3], 10) : 0;
    return h * 3600 + m * 60 + s;
  }

  return null;
}

/**
 * Extracts a timestamp (in integer seconds) from a YouTube URL (`?t=`, `&start=`, `&time_continue=`, or `#t=`).
 */
export function extractYouTubeTimestamp(url: string): number | null {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  try {
    const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalizedUrl);
    const paramCandidate =
      parsed.searchParams.get('t') ??
      parsed.searchParams.get('start') ??
      parsed.searchParams.get('time_continue');
    if (paramCandidate) {
      const sec = parseYouTubeTimestampValue(paramCandidate);
      if (sec !== null) return sec;
    }

    if (parsed.hash) {
      const hashMatch = parsed.hash.match(/(?:^#|&)(?:t|start|time_continue)=([^&#\s]+)/i);
      if (hashMatch?.[1]) {
        const sec = parseYouTubeTimestampValue(decodeURIComponent(hashMatch[1]));
        if (sec !== null) return sec;
      }
    }
  } catch {
    // Fallback regex parsing below for malformed/partial URL strings
  }

  const fallbackMatch = trimmed.match(/(?:[?&#]|^)(?:t|start|time_continue)=([^&#\s]+)/i);
  if (fallbackMatch?.[1]) {
    return parseYouTubeTimestampValue(decodeURIComponent(fallbackMatch[1]));
  }

  return null;
}

/**
 * Parses either a full YouTube URL (with optional timestamp) or a standalone timestamp string.
 */
export function parseYouTubeTimeInput(input: string): {
  seconds: number | null;
  videoId: string | null;
} {
  const trimmed = (input || '').trim();
  if (!trimmed) return { seconds: null, videoId: null };

  const videoId = extractYouTubeId(trimmed);
  if (videoId) {
    return {
      videoId,
      seconds: extractYouTubeTimestamp(trimmed),
    };
  }

  return {
    videoId: null,
    seconds: parseYouTubeTimestampValue(trimmed),
  };
}

/**
 * Builds a YouTube watch URL pointing directly to `absoluteSeconds` (via `&t=<sec>s` when > 0).
 */
export function buildYouTubeUrlAtTimestamp(videoId: string, absoluteSeconds: number): string {
  const sec = Math.max(0, Math.floor(absoluteSeconds || 0));
  if (sec > 0) {
    return `https://www.youtube.com/watch?v=${videoId}&t=${sec}s`;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Computes total absolute seconds in the underlying YouTube video from an episode + relative position.
 */
export function getAbsoluteYouTubeSeconds(
  episode: Pick<Episode, 'startSeconds'> | null | undefined,
  positionInEpisodeSeconds: number
): number {
  return Math.max(
    0,
    Math.floor((episode?.startSeconds || 0) + Math.max(0, positionInEpisodeSeconds || 0))
  );
}

/**
 * Maps an absolute YouTube timestamp (seconds from 0) onto the matching episode & offset inside `audio`.
 */
export function mapAbsoluteSecondsToEpisode(
  audio: AudioItem,
  absoluteSeconds: number
): MappedEpisodePosition | null {
  if (!audio?.episodes || audio.episodes.length === 0) {
    return null;
  }

  const sortedEpisodes = [...audio.episodes].sort(
    (a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0)
  );
  const absSec = Math.max(0, Math.floor(absoluteSeconds || 0));

  let target = sortedEpisodes.find(
    (ep) => absSec >= (ep.startSeconds || 0) && absSec < (ep.endSeconds || 0)
  );

  if (!target) {
    const first = sortedEpisodes[0];
    const last = sortedEpisodes[sortedEpisodes.length - 1];
    target = absSec < (first.startSeconds || 0) ? first : last;
  }

  const startSec = target.startSeconds || 0;
  const episodeDuration =
    target.duration || Math.max(1, (target.endSeconds || 0) - startSec) || 14400;
  const positionSeconds = Math.max(0, Math.min(absSec - startSec, episodeDuration));
  const progressPercent = Math.min(100, Math.round((positionSeconds / episodeDuration) * 100));

  return {
    episode: target,
    positionSeconds,
    absoluteSeconds: absSec,
    episodeDuration,
    progressPercent,
    formattedAbsolute: formatTime(absSec, absSec >= 3600),
    formattedEpisodePos: formatTime(positionSeconds, episodeDuration >= 3600),
  };
}

/**
 * Returns a cloned AudioItem with resume metadata updated to match `mapped`.
 */
export function applyMappedPositionToAudioCache(
  audio: AudioItem,
  mapped: MappedEpisodePosition
): AudioItem {
  const isDone = mapped.progressPercent >= 95;
  return {
    ...audio,
    currentEpisodeId: mapped.episode.id,
    currentEpisodeNumber: mapped.episode.episodeNumber,
    currentEpisodeTitle: mapped.episode.title,
    lastPositionSeconds: mapped.positionSeconds,
    formattedPosition: mapped.formattedEpisodePos,
    progressPercent: mapped.progressPercent,
    episodes: audio.episodes?.map((ep) =>
      ep.id === mapped.episode.id
        ? {
            ...ep,
            positionSeconds: mapped.positionSeconds,
            progressPercent: mapped.progressPercent,
            completed: isDone,
          }
        : ep
    ),
  };
}

/**
 * Maps an absolute YouTube timestamp to the right episode and persists progress cleanly.
 */
export async function syncAudioToYouTubeTimestamp(
  audio: AudioItem,
  absoluteSeconds: number,
  isLive = true
): Promise<MappedEpisodePosition | null> {
  if (!audio) return null;

  let mapped = mapAbsoluteSecondsToEpisode(audio, absoluteSeconds);
  if (!mapped) {
    try {
      const fullAudio = await api.audio.getAudioById(audio.id, isLive);
      if (fullAudio) {
        mapped = mapAbsoluteSecondsToEpisode(fullAudio, absoluteSeconds);
      }
    } catch {
      return null;
    }
  }

  if (!mapped) return null;

  await Promise.resolve(
    api.progress.updateProgress(
      {
        audioId: audio.id,
        episodeId: mapped.episode.id,
        positionSeconds: mapped.positionSeconds,
        progressPercent: mapped.progressPercent,
        completed: mapped.progressPercent >= 95,
      },
      isLive
    )
  );

  return mapped;
}
