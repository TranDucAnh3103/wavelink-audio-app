import { AudioItem, Episode } from '@/types';
import { formatTime } from '@/lib/utils';

export const LOCAL_PROGRESS_PREFIX = 'wavelink_progress_';
export const LAST_PLAYBACK_SESSION_KEY = 'wavelink_last_playback_session';
const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface LocalProgressSnapshot {
  audioId: number | string;
  episodeId: number;
  episodeNumber?: number;
  positionSeconds: number;
  duration: number;
  progressPercent?: number;
  updatedAt: number;
  serverSyncedAt?: number;
}

export interface LastPlaybackSession {
  audio: AudioItem;
  episode: Episode;
  positionSeconds: number;
  duration: number;
  updatedAt: number;
}

export function saveLocalProgressSnapshot(snapshot: LocalProgressSnapshot): void {
  if (typeof localStorage === 'undefined' || !snapshot.audioId || !snapshot.episodeId) return;
  try {
    const existing = readLocalProgressSnapshot(snapshot.audioId);
    const preservedSync =
      snapshot.serverSyncedAt ??
      (existing &&
      existing.episodeId === snapshot.episodeId &&
      existing.positionSeconds === snapshot.positionSeconds
        ? existing.serverSyncedAt
        : undefined);

    localStorage.setItem(
      `${LOCAL_PROGRESS_PREFIX}${snapshot.audioId}`,
      JSON.stringify({
        ...snapshot,
        positionSeconds: Math.max(0, Math.round(snapshot.positionSeconds)),
        serverSyncedAt: preservedSync,
      })
    );
  } catch {}
}

export function markLocalProgressServerSynced(
  audioId: number | string,
  episodeId: number,
  positionSeconds: number
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const existing = readLocalProgressSnapshot(audioId);
    if (!existing) return;
    if (
      String(existing.episodeId) === String(episodeId) &&
      Math.abs(existing.positionSeconds - Math.round(positionSeconds)) <= 5
    ) {
      localStorage.setItem(
        `${LOCAL_PROGRESS_PREFIX}${audioId}`,
        JSON.stringify({
          ...existing,
          serverSyncedAt: Date.now(),
        })
      );
    }
  } catch {}
}

export function readLocalProgressSnapshot(audioId: number | string): LocalProgressSnapshot | null {
  if (typeof localStorage === 'undefined' || !audioId) return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_PROGRESS_PREFIX}${audioId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalProgressSnapshot;
    if (!parsed || typeof parsed.positionSeconds !== 'number' || !parsed.episodeId) return null;
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > MAX_SNAPSHOT_AGE_MS) {
      localStorage.removeItem(`${LOCAL_PROGRESS_PREFIX}${audioId}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function reconcileAudioWithLocalSnapshot(audio: AudioItem): {
  audio: AudioItem;
  needsBackfill: LocalProgressSnapshot | null;
} {
  if (!audio) return { audio, needsBackfill: null };
  const snapshot = readLocalProgressSnapshot(audio.id);
  if (!snapshot || snapshot.positionSeconds <= 0) {
    return { audio, needsBackfill: null };
  }

  const episodes = Array.isArray(audio.episodes) ? audio.episodes : [];
  const matchedEpisode =
    episodes.find((ep) => String(ep.id) === String(snapshot.episodeId)) ||
    (snapshot.episodeNumber
      ? episodes.find((ep) => ep.episodeNumber === snapshot.episodeNumber)
      : undefined);

  if (episodes.length > 0 && !matchedEpisode) {
    return { audio, needsBackfill: null };
  }

  const serverEpNum = audio.currentEpisodeNumber || 1;
  const snapEpNum = matchedEpisode?.episodeNumber || snapshot.episodeNumber || serverEpNum;
  const serverPos = audio.lastPositionSeconds || 0;

  const isHigherEpisode = snapEpNum > serverEpNum;
  const isSameEpisodeAhead =
    snapEpNum === serverEpNum && snapshot.positionSeconds > serverPos + 3;
  const isServerEmpty = serverPos <= 0 && (!audio.progressPercent || audio.progressPercent <= 0);

  if (!isHigherEpisode && !isSameEpisodeAhead && !isServerEmpty) {
    return { audio, needsBackfill: null };
  }

  const targetDur =
    matchedEpisode?.duration ||
    (matchedEpisode ? matchedEpisode.endSeconds - matchedEpisode.startSeconds : 0) ||
    snapshot.duration ||
    14400;
  const clampedPos = Math.max(0, Math.min(Math.round(snapshot.positionSeconds), targetDur));
  const percent = Math.min(100, Math.round((clampedPos / Math.max(1, targetDur)) * 100));

  const updatedEpisodes =
    episodes.length > 0
      ? episodes.map((ep) => {
          if (matchedEpisode && ep.id === matchedEpisode.id) {
            return {
              ...ep,
              positionSeconds: clampedPos,
              progressPercent: percent,
              completed: percent >= 95,
            };
          }
          return ep;
        })
      : audio.episodes;

  const mergedAudio: AudioItem = {
    ...audio,
    episodes: updatedEpisodes,
    lastPositionSeconds: clampedPos,
    progressPercent: percent,
    formattedPosition: formatTime(clampedPos),
    currentEpisodeId: matchedEpisode?.id || snapshot.episodeId,
    currentEpisodeNumber: snapEpNum,
    currentEpisodeTitle: matchedEpisode?.title || audio.currentEpisodeTitle,
  };

  const needsBackfill =
    !snapshot.serverSyncedAt || snapshot.updatedAt > snapshot.serverSyncedAt
      ? {
          ...snapshot,
          positionSeconds: clampedPos,
          progressPercent: percent,
        }
      : null;

  return { audio: mergedAudio, needsBackfill };
}

export function saveLastPlaybackSession(
  audio: AudioItem,
  episode: Episode,
  positionSeconds: number,
  duration: number
): void {
  if (typeof localStorage === 'undefined' || !audio || !episode) return;
  try {
    // Store compact audio metadata + episodes without oversized description blobs
    const compactAudio: AudioItem = {
      ...audio,
      description: undefined,
      lastPositionSeconds: Math.max(0, Math.round(positionSeconds)),
      currentEpisodeId: episode.id,
      currentEpisodeNumber: episode.episodeNumber,
      currentEpisodeTitle: episode.title,
    };
    const session: LastPlaybackSession = {
      audio: compactAudio,
      episode: {
        ...episode,
        positionSeconds: Math.max(0, Math.round(positionSeconds)),
      },
      positionSeconds: Math.max(0, Math.round(positionSeconds)),
      duration: Math.max(1, Math.round(duration || episode.duration || 14400)),
      updatedAt: Date.now(),
    };
    localStorage.setItem(LAST_PLAYBACK_SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export function readLastPlaybackSession(): LastPlaybackSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_PLAYBACK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastPlaybackSession;
    if (!parsed || !parsed.audio?.id || !parsed.episode?.id) return null;
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > MAX_SNAPSHOT_AGE_MS) {
      localStorage.removeItem(LAST_PLAYBACK_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastPlaybackSession(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LAST_PLAYBACK_SESSION_KEY);
  } catch {}
}
