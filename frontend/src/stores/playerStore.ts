import { create } from 'zustand';
import { AudioItem, Episode } from '@/types';
import { api } from '@/services/api';
import { API_BASE } from '@/lib/axiosClient';
import { rateCoordinator, RateSyncStatus } from '@/lib/playbackRateCoordinator';
import { playerLogger } from '@/lib/playerLogger';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/components/ui/Toast';
import { startBackgroundAudio, stopBackgroundAudio } from '@/lib/backgroundAudioKeeper';
import { startBackgroundSleepTimer, stopBackgroundSleepTimer } from '@/lib/sleepTimerWorker';
import { startMediaSessionKeeper, stopMediaSessionKeeper } from '@/lib/mediaSessionWorker';
import { queryClient } from '@/lib/queryClient';
import { formatTime } from '@/lib/utils';
import { AudioEngineType } from '@/lib/audio/AudioEngine';
import { HtmlAudioEngine } from '@/lib/audio/HtmlAudioEngine';
import { YouTubeEngine } from '@/lib/audio/YouTubeEngine';
import { getAudioEngineMode, isIOSDevice, isVideoStreamFailed, clearVideoStreamFailed } from '@/lib/streamConfig';
import {
  clearLastPlaybackSession,
  readLastPlaybackSession,
  readLocalProgressSnapshot,
  saveLastPlaybackSession,
  saveLocalProgressSnapshot,
} from '@/lib/progressSnapshot';

// Global engine instances
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __playerStore?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __measureProgressionRate?: any;
    __WAVELINK_ENGINE__?: AudioEngineType;
  }
}

export const htmlAudioEngine = new HtmlAudioEngine((audioId, episodeId, episodeNumber) =>
  api.audio.getStreamToken(audioId, episodeId, episodeNumber)
);
export const youtubeAudioEngine = new YouTubeEngine();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ytPlayerInstance: any = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let sleepTimeout: ReturnType<typeof setTimeout> | null = null;
let seekDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let progressDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let sleepFadeTimer: ReturnType<typeof setInterval> | null = null;

let currentPlayerUserId: number | string | null = null;
let isAdvancingEpisode = false;
let lastLocalSaveTs = 0;
let lastServerSaveAt = 0;
let lastServerSavedPos = -1;
let lastStreamMediaSessionTs = 0;
let lastHtmlTimeUiUpdateAt = 0;
let ytTrackSwitchUntil = 0;

export function setCurrentPlayerUserId(userId?: number | string | null) {
  currentPlayerUserId = userId !== undefined ? userId : null;
}

export function getStoredPlaybackRate(userId?: number | string | null): number {
  if (typeof localStorage === 'undefined') return 1.0;
  try {
    const targetId = userId !== undefined && userId !== null ? userId : currentPlayerUserId;
    if (targetId !== undefined && targetId !== null) {
      const userSaved = localStorage.getItem(`comic_audio_user_speed_${targetId}`);
      if (userSaved) {
        const parsed = parseFloat(userSaved);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    const currentSaved = localStorage.getItem('comic_audio_current_speed');
    if (currentSaved) {
      const parsed = parseFloat(currentSaved);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const defaultSaved = localStorage.getItem('wavelink_default_playback_rate');
    if (defaultSaved) {
      const parsed = parseFloat(defaultSaved);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const wavelinkSaved = localStorage.getItem('wavelink_playback_rate');
    if (wavelinkSaved) {
      const parsed = parseFloat(wavelinkSaved);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const globalSaved = localStorage.getItem('comic_audio_preferred_playback_rate');
    if (globalSaved) {
      const parsed = parseFloat(globalSaved);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {}
  return 1.0;
}

export function persistUserPlaybackRate(rate: number, userId?: number | string | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    const rateStr = String(rate);
    localStorage.setItem('comic_audio_preferred_playback_rate', rateStr);
    localStorage.setItem('comic_audio_current_speed', rateStr);
    localStorage.setItem('wavelink_default_playback_rate', rateStr);
    localStorage.setItem('wavelink_playback_rate', rateStr);
    const targetId = userId !== undefined && userId !== null ? userId : currentPlayerUserId;
    if (targetId !== undefined && targetId !== null) {
      localStorage.setItem(`comic_audio_user_speed_${targetId}`, rateStr);
    }
  } catch {}
}

export function enforcePlaybackRate(rate: number) {
  const state = usePlayerStore.getState();
  if (isStreamEngineActive(state)) {
    htmlAudioEngine.setRate(rate);
    return;
  }
  rateCoordinator.setDesiredRate(rate, 'enforcePlaybackRate');
}

export async function measureProgressionRate(durationMs: number = 3000): Promise<{
  calculatedRate: number;
  deltaVideoSec: number;
  deltaWallSec: number;
  desiredRate: number;
  confirmedRate: number;
}> {
  const store = usePlayerStore.getState();
  const useStream = isStreamEngineActive(store);

  if (!useStream && (!ytPlayerInstance || typeof ytPlayerInstance.getCurrentTime !== 'function')) {
    throw new Error('Player is not active or getCurrentTime is unavailable');
  }

  const readTime = () => (useStream ? htmlAudioEngine.getTime() : ytPlayerInstance.getCurrentTime());

  const startTime = performance.now();
  const startVideoTime = readTime();

  await new Promise((r) => setTimeout(r, durationMs));

  const endTime = performance.now();
  const endVideoTime = readTime();

  const deltaWallSec = (endTime - startTime) / 1000;
  const deltaVideoSec = endVideoTime - startVideoTime;
  const calculatedRate = deltaVideoSec / deltaWallSec;

  const result = {
    calculatedRate: Math.round(calculatedRate * 100) / 100,
    deltaVideoSec: Math.round(deltaVideoSec * 1000) / 1000,
    deltaWallSec: Math.round(deltaWallSec * 1000) / 1000,
    desiredRate: store.playbackRate,
    confirmedRate: store.confirmedPlaybackRate,
  };

  playerLogger.log({
    instanceId: useStream ? 'html-audio' : rateCoordinator.getInstanceId(),
    action: 'MEASURE_PROGRESSION_RATE',
    desiredRate: result.desiredRate,
    confirmedRate: result.confirmedRate,
    details: result,
  });

  return result;
}

interface PlayerState {
  currentAudio: AudioItem | null;
  currentEpisode: Episode | null;
  isPlaying: boolean;
  isBuffering: boolean;
  isExplicitlyPaused: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  confirmedPlaybackRate: number;
  rateSyncStatus: RateSyncStatus;
  activeEngine: AudioEngineType;
  isYtReady: boolean;
  sleepTimerMinutes: number | null;
  sleepTimerEndTimestamp: number | null;
  isSeeking: boolean;
  isScreenLocked: boolean;

  // Actions
  setScreenLocked: (locked: boolean) => void;
  setAudioElement: (el: HTMLAudioElement | null) => void;
  setEngineMode: (mode: AudioEngineType) => void;
  fallbackToYouTube: (reason?: string) => void;
  play: (audio: AudioItem, episode?: Episode | null, seekSeconds?: number | null) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seekTo: (seconds: number) => void;
  skipSeconds: (delta: number) => void;
  nextEpisode: () => void;
  prevEpisode: () => void;
  setPlaybackRate: (rate: number, userId?: number | string | null) => void;
  syncUserPlaybackRate: (userId?: number | string | null) => void;
  cycleSpeed: (userId?: number | string | null) => void;
  setSleepTimer: (minutes: number | null) => void;
  hydrateLastPlaybackSession: () => void;
  close: () => void;
  reset: () => void;
  setYtReady: (ready: boolean) => void;
  setYtInstance: (instance: unknown, instanceId?: string) => void;
  handleEpisodeComplete: () => void;
}

function isStreamEngineActive(state: Pick<PlayerState, 'activeEngine'>): boolean {
  return state.activeEngine === 'stream' && htmlAudioEngine.isReady();
}

function isEpisodeVipBlocked(audio: AudioItem, episode: Episode): boolean {
  const currentUser = useAuthStore.getState().user;
  const isVipOrAdmin =
    currentUser?.role === 'VIP' || currentUser?.role === 'ADMIN' || currentUser?.membership === 'VIP';
  if (isVipOrAdmin) return false;
  const isVipAudio = Boolean(audio.isVIPOnly || audio.isVipOnly || episode.isVip);
  if (!isVipAudio) return false;
  const freeLimit = audio.freeEpisodesCount !== undefined ? audio.freeEpisodesCount : 1;
  return freeLimit === 0 || episode.episodeNumber > freeLimit || Boolean(episode.isLocked);
}

const initialStoredRate = getStoredPlaybackRate();
rateCoordinator.setDesiredRate(initialStoredRate, 'store_module_init');

function getInitialSleepTimer(): { minutes: number | null; endTimestamp: number | null } {
  if (typeof localStorage === 'undefined') return { minutes: null, endTimestamp: null };
  try {
    const savedEnd = localStorage.getItem('wavelink_sleep_timer_end');
    if (savedEnd) {
      const endTs = parseInt(savedEnd, 10);
      const remainingMs = endTs - Date.now();
      if (!isNaN(endTs) && remainingMs > 0) {
        const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000));
        return { minutes: remainingMinutes, endTimestamp: endTs };
      } else {
        localStorage.removeItem('wavelink_sleep_timer_end');
      }
    }
  } catch {}
  return { minutes: null, endTimestamp: null };
}

function expireSleepTimerNow() {
  const store = usePlayerStore.getState();
  if (sleepTimeout) {
    clearTimeout(sleepTimeout);
    sleepTimeout = null;
  }
  stopBackgroundSleepTimer();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('wavelink_sleep_timer_end');
  }
  usePlayerStore.setState({ sleepTimerMinutes: null, sleepTimerEndTimestamp: null });

  const finishPause = () => {
    usePlayerStore.getState().pause();
    if (htmlAudioEngine.isReady()) {
      htmlAudioEngine.setVolume(1.0);
    }
    stopBackgroundAudio();
    stopMediaSessionKeeper();
    toast.info('Đã tự động tắt audio theo hẹn giờ ngủ.');
  };

  // Gentle volume fade out in stream mode before pausing
  if (isStreamEngineActive(store) && store.isPlaying) {
    if (sleepFadeTimer) clearInterval(sleepFadeTimer);
    let vol = htmlAudioEngine.getVolume() || 1.0;
    const step = vol / 10;
    sleepFadeTimer = setInterval(() => {
      vol = Math.max(0, vol - step);
      htmlAudioEngine.setVolume(vol);
      if (vol <= 0.02) {
        if (sleepFadeTimer) {
          clearInterval(sleepFadeTimer);
          sleepFadeTimer = null;
        }
        finishPause();
      }
    }, 150);
  } else {
    finishPause();
  }
}

const initialSleepTimer = getInitialSleepTimer();
if (initialSleepTimer.endTimestamp) {
  const delayMs = Math.max(0, initialSleepTimer.endTimestamp - Date.now());
  sleepTimeout = setTimeout(expireSleepTimerNow, delayMs);
  startBackgroundSleepTimer(initialSleepTimer.endTimestamp, expireSleepTimerNow);
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentAudio: null,
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isExplicitlyPaused: true,
  currentTime: 0,
  duration: 14400,
  playbackRate: initialStoredRate,
  confirmedPlaybackRate: initialStoredRate,
  rateSyncStatus: 'synced',
  activeEngine: getAudioEngineMode(),
  isYtReady: false,
  sleepTimerMinutes: initialSleepTimer.minutes,
  sleepTimerEndTimestamp: initialSleepTimer.endTimestamp,
  isSeeking: false,
  isScreenLocked: false,

  setScreenLocked: (isScreenLocked: boolean) => set({ isScreenLocked }),
  setYtReady: (isYtReady: boolean) => set({ isYtReady }),

  hydrateLastPlaybackSession: () => {
    if (get().currentAudio) return;
    const session = readLastPlaybackSession();
    if (!session) return;
    const latestSnap = readLocalProgressSnapshot(session.audio.id);
    let targetEpisode = session.episode;
    let targetPos = session.positionSeconds;
    let targetDur = session.duration || targetEpisode.duration || 14400;

    if (latestSnap && latestSnap.updatedAt >= session.updatedAt && latestSnap.positionSeconds > 0) {
      const matchedEp =
        session.audio.episodes?.find((ep) => String(ep.id) === String(latestSnap.episodeId)) ||
        session.episode;
      if (matchedEp) {
        targetEpisode = matchedEp;
        targetDur =
          matchedEp.duration || (matchedEp.endSeconds - matchedEp.startSeconds) || latestSnap.duration || 14400;
        targetPos = Math.max(0, Math.min(latestSnap.positionSeconds, targetDur));
      }
    }

    set({
      currentAudio: {
        ...session.audio,
        lastPositionSeconds: targetPos,
        currentEpisodeId: targetEpisode.id,
        currentEpisodeNumber: targetEpisode.episodeNumber,
        currentEpisodeTitle: targetEpisode.title,
      },
      currentEpisode: {
        ...targetEpisode,
        positionSeconds: targetPos,
      },
      currentTime: targetPos,
      duration: targetDur,
      isPlaying: false,
      isBuffering: false,
      isExplicitlyPaused: true,
    });
  },

  setAudioElement: (el: HTMLAudioElement | null) => {
    htmlAudioEngine.attachElement(el);
    if (el) {
      const state = get();
      if (state.activeEngine === 'stream' && state.currentAudio && state.isPlaying && !state.isExplicitlyPaused) {
        const startSec = (state.currentEpisode?.startSeconds || 0) + (state.currentTime || 0);
        void htmlAudioEngine.load({
          audioId: state.currentAudio.id,
          videoId: state.currentAudio.youtubeVideoId,
          episodeId: state.currentEpisode?.id,
          episodeNumber: state.currentEpisode?.episodeNumber,
          startSeconds: startSec,
          autoplay: true,
          playbackRate: state.playbackRate || 1.0,
        });
      }
    }
  },

  setEngineMode: (mode: AudioEngineType) => {
    if (mode === get().activeEngine) return;
    if (mode === 'youtube') {
      htmlAudioEngine.stop();
    } else {
      youtubeAudioEngine.stop();
    }
    set({ activeEngine: mode });
    if (typeof window !== 'undefined') {
      window.__WAVELINK_ENGINE__ = mode;
    }
  },

  fallbackToYouTube: (reason?: string) => {
    const state = get();
    htmlAudioEngine.stop();
    stopBackgroundAudio();
    stopMediaSessionKeeper();

    set({ activeEngine: 'youtube', isBuffering: false });
    if (typeof window !== 'undefined') {
      window.__WAVELINK_ENGINE__ = 'youtube';
    }
    if (reason) {
      toast.info(reason);
    }

    if (state.currentAudio && state.isPlaying && !state.isExplicitlyPaused && ytPlayerInstance) {
      const startSec = (state.currentEpisode?.startSeconds || 0) + (state.currentTime || 0);
      void youtubeAudioEngine.load({
        audioId: state.currentAudio.id,
        videoId: state.currentAudio.youtubeVideoId,
        episodeId: state.currentEpisode?.id,
        episodeNumber: state.currentEpisode?.episodeNumber,
        startSeconds: startSec,
        autoplay: true,
        playbackRate: state.playbackRate || 1.0,
      });
      startPolling();
      startBackgroundAudio({ engine: get().activeEngine === 'stream' ? 'stream' : 'youtube' });
      startMediaSessionKeeper(onWorkerMediaTick);
    }
  },

  setYtInstance: (instance: unknown, instanceId: string = 'yt-player-host') => {
    ytPlayerInstance = instance;
    youtubeAudioEngine.attachPlayer(instance, instanceId);

    // Compatibility: if no HTML5 <audio> element is mounted (e.g., legacy unit tests or youtube mode),
    // switch activeEngine to 'youtube' so setYtInstance tests execute the YouTube coordinator path.
    const updates: Partial<PlayerState> = { isYtReady: true };
    if (!htmlAudioEngine.isReady()) {
      updates.activeEngine = 'youtube';
    }
    set(updates);

    const currentRate = get().playbackRate || getStoredPlaybackRate() || 1.0;
    rateCoordinator.setDesiredRate(currentRate, 'setYtInstance');
    if (currentRate !== 1.0) {
      rateCoordinator.enforceRateWithRetries(currentRate, 'yt_instance_ready');
    }

    const state = get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const player = instance as any;
    if (
      state.activeEngine === 'youtube' &&
      state.currentAudio &&
      state.isPlaying &&
      player &&
      typeof player.loadVideoById === 'function'
    ) {
      const ep = state.currentEpisode;
      const startSec = (ep?.startSeconds || 0) + (state.currentTime || 0);
      try {
        player.loadVideoById({
          videoId: state.currentAudio.youtubeVideoId,
          startSeconds: startSec,
        });
        player.playVideo();
      } catch (err) {
        console.warn('Error loading pending video on yt ready:', err);
      }
    }
  },

  play: (audio: AudioItem, episode = null, seekSeconds = null) => {
    if (!audio) return;

    // 1. Lưu lại tiến trình của tập trước nếu đang đổi sang tập khác hoặc truyện khác
    const prevAudio = get().currentAudio;
    const prevEp = get().currentEpisode;
    const prevTime = get().currentTime;
    const prevDur = get().duration;
    if (prevAudio && prevEp && (prevAudio.id !== audio.id || (episode && prevEp.id !== episode.id))) {
      saveProgressFor(prevAudio, prevEp, prevTime, prevDur);
    }

    // 2. Xác định tập mục tiêu cần phát
    let targetEpisode = episode;
    if (!targetEpisode && audio.episodes && audio.episodes.length > 0) {
      if (audio.currentEpisodeId) {
        targetEpisode = audio.episodes.find((e) => e.id === audio.currentEpisodeId) || null;
      }
      if (!targetEpisode && audio.currentEpisodeNumber) {
        targetEpisode = audio.episodes.find((e) => e.episodeNumber === audio.currentEpisodeNumber) || null;
      }
      if (!targetEpisode) {
        targetEpisode =
          audio.episodes.find((e) => !e.completed && (e.progressPercent || 0) < 95) || audio.episodes[0];
      }
    }

    if (!targetEpisode) {
      targetEpisode = {
        id: audio.currentEpisodeId || 1,
        episodeNumber: audio.currentEpisodeNumber || 1,
        title: audio.currentEpisodeTitle || 'Tập 1',
        startSeconds: 0,
        endSeconds: audio.totalDurationSeconds || 14400,
        duration: audio.totalDurationSeconds || 14400,
      };
    }

    // Kiểm tra quyền hạn VIP
    const currentUser = useAuthStore.getState().user;
    if (isEpisodeVipBlocked(audio, targetEpisode)) {
      if (isStreamEngineActive(get())) {
        htmlAudioEngine.pause();
      } else if (ytPlayerInstance && typeof ytPlayerInstance.pauseVideo === 'function') {
        try {
          ytPlayerInstance.pauseVideo();
        } catch {}
      }
      stopPolling();
      stopHeartbeat();
      set({ isPlaying: false });
      if (!currentUser || currentUser.isGuest || currentUser.role === 'GUEST') {
        toast.info('Tập VIP yêu cầu đăng nhập tài khoản. Vui lòng đăng nhập để nghe!');
        navigateToAppRoute('/login');
      } else {
        toast.error('Tập này chỉ dành riêng cho thành viên VIP. Vui lòng nâng cấp gói để tiếp tục nghe!');
        navigateToAppRoute('/membership');
      }
      return;
    }

    const duration =
      targetEpisode.duration || (targetEpisode.endSeconds - targetEpisode.startSeconds) || 14400;

    // 3. Xác định vị trí phát (seekSeconds)
    let posInEp = 0;
    if (seekSeconds !== null && seekSeconds !== undefined) {
      posInEp = seekSeconds;
    } else if (
      audio.lastPositionSeconds &&
      (audio.currentEpisodeNumber === targetEpisode.episodeNumber ||
        audio.currentEpisodeId === targetEpisode.id ||
        !audio.currentEpisodeNumber)
    ) {
      posInEp = audio.lastPositionSeconds;
    } else if (targetEpisode.positionSeconds) {
      posInEp = targetEpisode.positionSeconds;
    }
    const currentTime = Math.max(0, Math.min(posInEp, duration));
    const absoluteStart = (targetEpisode.startSeconds || 0) + currentTime;

    const activeRate = get().playbackRate || getStoredPlaybackRate() || 1.0;

    // Auto-select fallback YouTube engine if this video previously failed stream extraction
    const configuredMode = getAudioEngineMode();
    let targetEngine = get().activeEngine;
    if (
      configuredMode === 'stream' &&
      htmlAudioEngine.isReady() &&
      audio.streamStatus !== 'FAILED' &&
      !isVideoStreamFailed(audio.youtubeVideoId)
    ) {
      targetEngine = 'stream';
      youtubeAudioEngine.stop();
    } else if (audio.streamStatus === 'FAILED' || isVideoStreamFailed(audio.youtubeVideoId)) {
      targetEngine = 'youtube';
      htmlAudioEngine.stop();
    }

    if (seekDebounceTimer) {
      clearTimeout(seekDebounceTimer);
      seekDebounceTimer = null;
    }

    set({
      currentAudio: audio,
      currentEpisode: targetEpisode,
      currentTime,
      duration,
      isPlaying: true,
      isBuffering: false,
      isSeeking: false,
      isExplicitlyPaused: false,
      playbackRate: activeRate,
      activeEngine: targetEngine,
      ...(targetEngine === 'stream'
        ? { confirmedPlaybackRate: activeRate, rateSyncStatus: 'synced' as RateSyncStatus }
        : {}),
    });

    if (targetEngine === 'stream' && htmlAudioEngine.isReady()) {
      void htmlAudioEngine.load({
        audioId: audio.id,
        videoId: audio.youtubeVideoId,
        episodeId: targetEpisode.id,
        episodeNumber: targetEpisode.episodeNumber,
        startSeconds: absoluteStart,
        autoplay: true,
        playbackRate: activeRate,
      });
      startPolling(); // Used for sleep timer check in stream mode
      startHeartbeat();
      startBackgroundAudio({ engine: 'stream' });
      startMediaSessionKeeper(onWorkerMediaTick);
    } else {
      rateCoordinator.onVideoLoaded(audio.youtubeVideoId);

      if (prevAudio?.youtubeVideoId !== audio.youtubeVideoId) {
        ytTrackSwitchUntil = Date.now() + 2500;
        if (ytPlayerInstance && typeof ytPlayerInstance.pauseVideo === 'function') {
          try {
            ytPlayerInstance.pauseVideo();
          } catch {}
        }
      }

      if (ytPlayerInstance && typeof ytPlayerInstance.loadVideoById === 'function') {
        try {
          ytPlayerInstance.loadVideoById({
            videoId: audio.youtubeVideoId,
            startSeconds: absoluteStart,
          });
          ytPlayerInstance.playVideo();
        } catch (err) {
          console.warn('YouTube playVideo call error:', err);
        }
      }

      startPolling();
      startHeartbeat();
      startBackgroundAudio({ engine: get().activeEngine === 'stream' ? 'stream' : 'youtube' });
      startMediaSessionKeeper(onWorkerMediaTick);
    }

    // Lưu ngay vị trí bắt đầu của tập mới để ghi nhận tập đang nghe mới nhất
    saveProgressFor(audio, targetEpisode, currentTime, duration);
    updateMediaSession(true, audio, targetEpisode, currentTime, duration, activeRate);
  },

  togglePlay: () => {
    const state = get();
    const { isPlaying, currentAudio } = state;
    if (!currentAudio) return;

    const nextPlaying = !isPlaying;

    if (isStreamEngineActive(state)) {
      if (nextPlaying) {
        void htmlAudioEngine.play();
      } else {
        htmlAudioEngine.pause();
      }
      set({ isPlaying: nextPlaying, isExplicitlyPaused: !nextPlaying });
      if (nextPlaying) {
        startPolling();
        startHeartbeat();
        startBackgroundAudio({ engine: 'stream' });
        startMediaSessionKeeper(onWorkerMediaTick);
      } else {
        saveCurrentProgress();
        stopPolling();
        stopHeartbeat();
        stopBackgroundAudio();
        stopMediaSessionKeeper();
      }
      updateMediaSession(nextPlaying, currentAudio, state.currentEpisode, state.currentTime, state.duration, state.playbackRate);
      return;
    }

    if (ytPlayerInstance) {
      try {
        if (isPlaying) {
          ytPlayerInstance.pauseVideo();
        } else {
          ytPlayerInstance.playVideo();
          rateCoordinator.applyRate('togglePlay_resume');
        }
      } catch {
        // Fallback
      }
    }

    set({ isPlaying: nextPlaying, isExplicitlyPaused: !nextPlaying });
    if (nextPlaying) {
      startPolling();
      startHeartbeat();
      startBackgroundAudio({ engine: get().activeEngine === 'stream' ? 'stream' : 'youtube' });
      startMediaSessionKeeper(onWorkerMediaTick);
    } else {
      saveCurrentProgress();
      stopPolling();
      stopHeartbeat();
      stopBackgroundAudio();
      stopMediaSessionKeeper();
    }
    updateMediaSession(nextPlaying, currentAudio, get().currentEpisode, get().currentTime, get().duration, get().playbackRate);
  },

  pause: () => {
    const state = get();
    const livePos = getLivePlaybackPositionSeconds();
    saveCurrentProgress();
    if (isStreamEngineActive(state)) {
      htmlAudioEngine.pause();
      set({ isPlaying: false, isBuffering: false, isExplicitlyPaused: true, currentTime: livePos });
      stopPolling();
      stopHeartbeat();
      stopBackgroundAudio();
      stopMediaSessionKeeper();
      updateMediaSession(false, state.currentAudio, state.currentEpisode, livePos, state.duration, state.playbackRate);
      return;
    }

    if (ytPlayerInstance) {
      try {
        ytPlayerInstance.pauseVideo();
      } catch {
        // Ignore
      }
    }
    set({ isPlaying: false, isBuffering: false, isExplicitlyPaused: true, currentTime: livePos });
    stopPolling();
    stopHeartbeat();
    stopBackgroundAudio();
    stopMediaSessionKeeper();
    updateMediaSession(false, get().currentAudio, get().currentEpisode, livePos, get().duration, get().playbackRate);
  },

  resume: () => {
    const state = get();
    if (state.currentAudio) {
      // If a transient background drop pushed playback to YouTube earlier and network is back,
      // recover into stream mode (which survives screen lock) instead of staying stuck on YouTube.
      const configuredMode = getAudioEngineMode();
      const canRecoverStream =
        state.activeEngine === 'youtube' &&
        configuredMode === 'stream' &&
        htmlAudioEngine.isReady() &&
        state.currentAudio.streamStatus !== 'FAILED' &&
        (typeof navigator === 'undefined' || navigator.onLine !== false);

      if (canRecoverStream) {
        clearVideoStreamFailed(state.currentAudio.youtubeVideoId);
        get().play(state.currentAudio, state.currentEpisode, state.currentTime);
        return;
      }

      if (isStreamEngineActive(state)) {
        if (htmlAudioEngine.getLoadedVideoId() !== state.currentAudio.youtubeVideoId) {
          get().play(state.currentAudio, state.currentEpisode, state.currentTime);
          return;
        }
        void htmlAudioEngine.play();
        set({ isPlaying: true, isExplicitlyPaused: false });
        startPolling();
        startHeartbeat();
        startBackgroundAudio({ engine: 'stream' });
        startMediaSessionKeeper(onWorkerMediaTick);
        updateMediaSession(true, state.currentAudio, state.currentEpisode, state.currentTime, state.duration, state.playbackRate);
        return;
      }
    }

    if (ytPlayerInstance) {
      try {
        ytPlayerInstance.playVideo();
        rateCoordinator.applyRate('resume_playback');
      } catch {
        // Ignore
      }
    }
    set({ isPlaying: true, isExplicitlyPaused: false });
    startPolling();
    startHeartbeat();
    startBackgroundAudio({ engine: get().activeEngine === 'stream' ? 'stream' : 'youtube' });
    startMediaSessionKeeper(onWorkerMediaTick);
    updateMediaSession(true, get().currentAudio, get().currentEpisode, get().currentTime, get().duration, get().playbackRate);
  },

  seekTo: (seconds: number) => {
    const state = get();
    const { currentEpisode, duration, currentAudio } = state;
    if (!currentEpisode) return;

    const currentUser = useAuthStore.getState().user;
    const isVipOrAdmin = currentUser?.role === 'VIP' || currentUser?.role === 'ADMIN' || currentUser?.membership === 'VIP';
    const isVipAudio = Boolean(currentAudio?.isVIPOnly || currentAudio?.isVipOnly || currentEpisode.isVip);

    let maxAllowed = duration;
    if (isVipAudio && !isVipOrAdmin) {
      maxAllowed = Math.min(duration, (currentEpisode.endSeconds - currentEpisode.startSeconds) || duration);
    }

    const clamped = Math.max(0, Math.min(seconds, maxAllowed));
    set({ currentTime: clamped, isSeeking: true });

    if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
    seekDebounceTimer = setTimeout(() => {
      set({ isSeeking: false });
    }, 1200);

    const absoluteTarget = (currentEpisode.startSeconds || 0) + clamped;

    if (isStreamEngineActive(state)) {
      htmlAudioEngine.seek(absoluteTarget);
      updateMediaSession(state.isPlaying, currentAudio, currentEpisode, clamped, duration, state.playbackRate);
    } else if (ytPlayerInstance && typeof ytPlayerInstance.seekTo === 'function') {
      try {
        ytPlayerInstance.seekTo(absoluteTarget, true);
        rateCoordinator.applyRate('seekTo_complete');
      } catch (err) {
        console.warn('YouTube seekTo error:', err);
      }
    }

    debouncedSaveProgress();
  },

  skipSeconds: (delta: number) => {
    get().seekTo(get().currentTime + delta);
  },

  nextEpisode: () => {
    const { currentAudio, currentEpisode, currentTime, duration } = get();
    if (!currentAudio || !currentAudio.episodes) return;
    if (currentEpisode) {
      saveProgressFor(currentAudio, currentEpisode, currentTime, duration);
    }
    const eps = currentAudio.episodes;
    const currentIndex = eps.findIndex((e) => e.id === currentEpisode?.id);
    if (currentIndex !== -1 && currentIndex + 1 < eps.length) {
      const nextEp = eps[currentIndex + 1];
      if (isEpisodeVipBlocked(currentAudio, nextEp)) {
        toast.error('Tập tiếp theo chỉ dành riêng cho thành viên VIP. Vui lòng nâng cấp gói!');
        return;
      }
      get().play(currentAudio, nextEp, 0);
    }
  },

  prevEpisode: () => {
    const { currentAudio, currentEpisode, currentTime, duration } = get();
    if (!currentAudio || !currentAudio.episodes) return;
    if (currentEpisode) {
      saveProgressFor(currentAudio, currentEpisode, currentTime, duration);
    }
    const eps = currentAudio.episodes;
    const currentIndex = eps.findIndex((e) => e.id === currentEpisode?.id);
    if (currentIndex > 0) {
      get().play(currentAudio, eps[currentIndex - 1], 0);
    } else {
      get().seekTo(0);
    }
  },

  setPlaybackRate: (rate: number, userId?: number | string | null) => {
    const numRate = parseFloat(String(rate)) || 1.0;
    const targetUserId = userId || currentPlayerUserId;
    if (targetUserId) {
      currentPlayerUserId = targetUserId;
    }

    persistUserPlaybackRate(numRate, targetUserId);
    rateCoordinator.setDesiredRate(numRate, 'user_action');

    const state = get();
    if (isStreamEngineActive(state)) {
      htmlAudioEngine.setRate(numRate);
      set({
        playbackRate: numRate,
        confirmedPlaybackRate: numRate,
        rateSyncStatus: 'synced',
      });
      updateMediaSession(
        state.isPlaying,
        state.currentAudio,
        state.currentEpisode,
        state.currentTime,
        state.duration,
        numRate
      );
      return;
    }

    set({
      playbackRate: numRate,
      confirmedPlaybackRate: rateCoordinator.getConfirmedRate(),
      rateSyncStatus: rateCoordinator.getSyncStatus(),
    });
  },

  syncUserPlaybackRate: (userId?: number | string | null) => {
    const targetUserId = userId !== undefined ? userId : currentPlayerUserId;
    if (targetUserId !== undefined && targetUserId !== null) {
      currentPlayerUserId = targetUserId;
    }

    const effectiveRate = getStoredPlaybackRate(targetUserId);

    rateCoordinator.setDesiredRate(effectiveRate, 'user_account_sync');
    const state = get();
    if (isStreamEngineActive(state)) {
      htmlAudioEngine.setRate(effectiveRate);
      set({
        playbackRate: effectiveRate,
        confirmedPlaybackRate: effectiveRate,
        rateSyncStatus: 'synced',
      });
      persistUserPlaybackRate(effectiveRate, targetUserId);
      return;
    }

    set({
      playbackRate: effectiveRate,
      confirmedPlaybackRate: rateCoordinator.getConfirmedRate(),
      rateSyncStatus: rateCoordinator.getSyncStatus(),
    });
    persistUserPlaybackRate(effectiveRate, targetUserId);
  },

  cycleSpeed: (userId?: number | string | null) => {
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const current = get().playbackRate || 1.0;
    const currentIndex = speeds.findIndex((s) => Math.abs(s - current) < 0.05);
    const nextIndex = currentIndex === -1 ? 1 : (currentIndex + 1) % speeds.length;
    get().setPlaybackRate(speeds[nextIndex], userId || currentPlayerUserId);
  },

  setSleepTimer: (minutes: number | null) => {
    if (sleepTimeout) {
      clearTimeout(sleepTimeout);
      sleepTimeout = null;
    }
    if (sleepFadeTimer) {
      clearInterval(sleepFadeTimer);
      sleepFadeTimer = null;
    }
    stopBackgroundSleepTimer();

    if (!minutes || minutes <= 0) {
      set({ sleepTimerMinutes: null, sleepTimerEndTimestamp: null });
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('wavelink_sleep_timer_end');
      }
      return;
    }

    const endTimestamp = Date.now() + minutes * 60 * 1000;
    set({ sleepTimerMinutes: minutes, sleepTimerEndTimestamp: endTimestamp });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('wavelink_sleep_timer_end', String(endTimestamp));
    }

    sleepTimeout = setTimeout(expireSleepTimerNow, minutes * 60 * 1000);
    startBackgroundSleepTimer(endTimestamp, expireSleepTimerNow);
  },

  close: () => {
    const state = get();
    const { currentAudio, currentEpisode, duration } = state;
    let currentPos = state.currentTime;

    if (isStreamEngineActive(state)) {
      const absTime = htmlAudioEngine.getTime();
      const startSec = currentEpisode?.startSeconds || 0;
      const epPos = Math.round(absTime - startSec);
      if (absTime > 0 && epPos >= 0) {
        currentPos = epPos;
      }
      htmlAudioEngine.pause();
    } else if (ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
      try {
        const absTime = ytPlayerInstance.getCurrentTime();
        const startSec = currentEpisode?.startSeconds || 0;
        const epPos = Math.round(absTime - startSec);
        if (epPos >= 0) {
          currentPos = epPos;
        }
      } catch {}
    }

    if (currentAudio && currentEpisode) {
      saveProgressFor(currentAudio, currentEpisode, currentPos, duration);
    }

    if (!isStreamEngineActive(state) && ytPlayerInstance) {
      try {
        ytPlayerInstance.pauseVideo();
      } catch {
        // Ignore
      }
    }
    stopPolling();
    stopHeartbeat();
    stopBackgroundAudio();
    stopBackgroundSleepTimer();
    stopMediaSessionKeeper();
    if (sleepTimeout) {
      clearTimeout(sleepTimeout);
      sleepTimeout = null;
    }
    if (sleepFadeTimer) {
      clearInterval(sleepFadeTimer);
      sleepFadeTimer = null;
    }
    if (seekDebounceTimer) {
      clearTimeout(seekDebounceTimer);
      seekDebounceTimer = null;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('wavelink_sleep_timer_end');
    }
    clearLastPlaybackSession();
    set({
      currentAudio: null,
      currentEpisode: null,
      isPlaying: false,
      isBuffering: false,
      isSeeking: false,
      isExplicitlyPaused: true,
      currentTime: currentPos,
      sleepTimerMinutes: null,
      sleepTimerEndTimestamp: null,
      isScreenLocked: false,
    });
    updateMediaSession(false, null, null);
  },

  reset: () => {
    htmlAudioEngine.stop();
    if (ytPlayerInstance) {
      try {
        ytPlayerInstance.pauseVideo?.();
        ytPlayerInstance.seekTo?.(0, true);
      } catch {
        // Ignore
      }
    }
    stopPolling();
    stopHeartbeat();
    stopBackgroundAudio();
    stopBackgroundSleepTimer();
    stopMediaSessionKeeper();
    if (sleepTimeout) {
      clearTimeout(sleepTimeout);
      sleepTimeout = null;
    }
    if (sleepFadeTimer) {
      clearInterval(sleepFadeTimer);
      sleepFadeTimer = null;
    }
    if (seekDebounceTimer) {
      clearTimeout(seekDebounceTimer);
      seekDebounceTimer = null;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('wavelink_sleep_timer_end');
    }
    clearLastPlaybackSession();
    const storedRate = getStoredPlaybackRate();
    rateCoordinator.setDesiredRate(storedRate, 'store_reset');
    set({
      currentAudio: null,
      currentEpisode: null,
      isPlaying: false,
      isBuffering: false,
      isSeeking: false,
      isExplicitlyPaused: true,
      currentTime: 0,
      playbackRate: storedRate,
      confirmedPlaybackRate: storedRate,
      rateSyncStatus: 'synced',
      sleepTimerMinutes: null,
      sleepTimerEndTimestamp: null,
      isScreenLocked: false,
    });
    updateMediaSession(false, null, null);
  },

  handleEpisodeComplete: () => {
    const state = get();
    const { currentAudio, currentEpisode, duration } = state;
    if (!currentAudio || !currentEpisode) return;

    saveProgressFor(currentAudio, currentEpisode, duration, duration);

    const currentUser = useAuthStore.getState().user;
    const eps = currentAudio.episodes || [];
    const currentIndex = eps.findIndex((e) => e.id === currentEpisode.id);
    if (currentIndex !== -1 && currentIndex + 1 < eps.length) {
      const nextEp = eps[currentIndex + 1];
      if (isEpisodeVipBlocked(currentAudio, nextEp)) {
        if (isStreamEngineActive(state)) {
          htmlAudioEngine.pause();
        } else if (ytPlayerInstance && typeof ytPlayerInstance.pauseVideo === 'function') {
          try {
            ytPlayerInstance.pauseVideo();
          } catch {}
        }
        stopPolling();
        stopHeartbeat();
        set({ isPlaying: false });
        if (!currentUser || currentUser.isGuest || currentUser.role === 'GUEST') {
          toast.info('Bạn đã nghe xong các tập miễn phí. Tập tiếp theo là tập VIP, vui lòng đăng nhập để nghe tiếp!');
          navigateToAppRoute('/login');
        } else {
          toast.error('Bạn đã nghe xong phần nghe thử. Tập tiếp theo chỉ dành riêng cho thành viên VIP. Vui lòng nâng cấp gói!');
          navigateToAppRoute('/membership');
        }
        return;
      }

      // Stream mode: seamless virtual chapter transition without pausing or reloading <audio> src
      if (isStreamEngineActive(state)) {
        const nextDur = nextEp.duration || (nextEp.endSeconds - nextEp.startSeconds) || 14400;
        set({
          currentEpisode: nextEp,
          currentTime: 0,
          duration: nextDur,
          isPlaying: true,
          isExplicitlyPaused: false,
        });
        const curTime = htmlAudioEngine.getTime();
        if (Math.abs(curTime - (nextEp.startSeconds || 0)) > 2) {
          htmlAudioEngine.seek(nextEp.startSeconds || 0);
        }
        saveProgressFor(currentAudio, nextEp, 0, nextDur);
        updateMediaSession(true, currentAudio, nextEp, 0, nextDur, state.playbackRate);
        return;
      }

      setTimeout(() => {
        if (get().currentAudio?.id === currentAudio.id) {
          get().play(currentAudio, nextEp, 0);
        }
      }, 1000);
    } else {
      get().pause();
    }
  },
}));

// Wire HTML5 AudioEngine event listeners once at module initialization
htmlAudioEngine.on('time', (absTime, mediaDur) => {
  const store = usePlayerStore.getState();
  if (!isStreamEngineActive(store) || !store.currentAudio || !store.currentEpisode) return;
  if (htmlAudioEngine.getLoadedVideoId() !== store.currentAudio.youtubeVideoId) return;

  const ep = store.currentEpisode;
  const startSec = ep.startSeconds || 0;
  let endSec = ep.endSeconds || store.duration;

  // Update real duration if single-episode audio reports an accurate media duration
  const totalEps = store.currentAudio.episodes?.length || 1;
  if (totalEps <= 1 && mediaDur > 0 && Math.abs(mediaDur - store.duration) > 2) {
    endSec = startSec + Math.round(mediaDur);
    usePlayerStore.setState({ duration: Math.round(mediaDur) });
  }

  if (!store.isSeeking) {
    const epPos = Math.max(0, Math.round(absTime - startSec));
    const now = Date.now();
    const isTabHidden = typeof document !== 'undefined' && document.hidden;

    if (
      !isTabHidden &&
      epPos !== store.currentTime &&
      (now - lastHtmlTimeUiUpdateAt >= 500 || Math.abs(epPos - store.currentTime) >= 2)
    ) {
      lastHtmlTimeUiUpdateAt = now;
      usePlayerStore.setState({ currentTime: epPos });
    }

    if (now - lastLocalSaveTs >= 5000) {
      lastLocalSaveTs = now;
      saveLocalSnapshot(store.currentAudio, ep, epPos, store.duration);
    }

    // Push live background playback progress to server at least every 15s of actual audio playback,
    // independent of main-thread setInterval throttling on Android Chrome / WebView.
    if (
      store.isPlaying &&
      now - lastServerSaveAt >= 15000 &&
      Math.abs(epPos - lastServerSavedPos) >= 3
    ) {
      saveProgressFor(store.currentAudio, ep, epPos, store.duration);
    }

    if (now - lastStreamMediaSessionTs >= 3000 && store.isPlaying) {
      lastStreamMediaSessionTs = now;
      updateMediaSession(true, store.currentAudio, ep, epPos, store.duration, store.playbackRate);
    }
  }

  if (!store.isSeeking && !isAdvancingEpisode && endSec > startSec && absTime >= endSec) {
    isAdvancingEpisode = true;
    try {
      if (isEpisodeVipBlocked(store.currentAudio, ep)) {
        htmlAudioEngine.pause();
        htmlAudioEngine.seek(endSec);
      }
      store.handleEpisodeComplete();
    } finally {
      setTimeout(() => {
        isAdvancingEpisode = false;
      }, 400);
    }
  }
});

htmlAudioEngine.on('state', (engineState) => {
  const store = usePlayerStore.getState();
  if (!isStreamEngineActive(store)) return;

  if (engineState === 'playing') {
    usePlayerStore.setState({ isPlaying: true, isBuffering: false, isSeeking: false });
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  } else if (engineState === 'buffering' || engineState === 'loading') {
    usePlayerStore.setState({ isBuffering: true });
  } else if (engineState === 'paused') {
    usePlayerStore.setState({ isPlaying: false, isBuffering: false });
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }
});

htmlAudioEngine.on('rate', (rate) => {
  const store = usePlayerStore.getState();
  if (isStreamEngineActive(store)) {
    usePlayerStore.setState({ confirmedPlaybackRate: rate, rateSyncStatus: 'synced' });
  }
});

htmlAudioEngine.on('ended', () => {
  const store = usePlayerStore.getState();
  if (
    isStreamEngineActive(store) &&
    store.isPlaying &&
    !store.isExplicitlyPaused &&
    store.currentAudio &&
    htmlAudioEngine.getLoadedVideoId() === store.currentAudio.youtubeVideoId
  ) {
    store.handleEpisodeComplete();
  }
});

htmlAudioEngine.on('error', (err) => {
  const store = usePlayerStore.getState();
  if (err.code === 'VIP_FORBIDDEN') {
    store.pause();
    toast.error(err.message);
    return;
  }
  if (err.shouldFallbackToYouTube && store.activeEngine === 'stream') {
    store.fallbackToYouTube(err.message);
  } else if (!err.fatal) {
    toast.info(err.message);
  }
});

// Đăng ký listener từ coordinator vào store để đồng bộ trạng thái confirmedPlaybackRate (YouTube mode)
rateCoordinator.subscribe({
  onDesiredRateChange: (rate) => {
    usePlayerStore.setState({ playbackRate: rate });
  },
  onConfirmedRateChange: (rate, status) => {
    const store = usePlayerStore.getState();
    if (!isStreamEngineActive(store)) {
      usePlayerStore.setState({ confirmedPlaybackRate: rate, rateSyncStatus: status });
    }
  },
});

function getLivePlaybackPositionSeconds(): number {
  const store = usePlayerStore.getState();
  const { currentAudio, currentEpisode, currentTime, duration } = store;
  if (!currentAudio || !currentEpisode) return currentTime || 0;

  const startSec = currentEpisode.startSeconds || 0;
  const maxDur = duration || currentEpisode.duration || 14400;

  if (
    isStreamEngineActive(store) &&
    htmlAudioEngine.getLoadedVideoId() === currentAudio.youtubeVideoId
  ) {
    const absTime = htmlAudioEngine.getTime();
    if (absTime > 0 || startSec === 0) {
      const epPos = Math.round(absTime - startSec);
      if (epPos >= 0) {
        return Math.min(epPos, maxDur);
      }
    }
  } else if (ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
    try {
      const absTime = ytPlayerInstance.getCurrentTime();
      if (typeof absTime === 'number' && absTime >= 0) {
        const epPos = Math.round(absTime - startSec);
        if (epPos >= 0) {
          return Math.min(epPos, maxDur);
        }
      }
    } catch {}
  }

  return Math.max(0, currentTime || 0);
}

function onWorkerMediaTick() {
  const store = usePlayerStore.getState();
  if (!store.isPlaying || store.isExplicitlyPaused || !store.currentAudio) return;

  const now = Date.now();
  if (isStreamEngineActive(store)) {
    const livePos = getLivePlaybackPositionSeconds();
    saveLocalSnapshot(store.currentAudio, store.currentEpisode!, livePos, store.duration);
    if (now - lastServerSaveAt >= 15000 && Math.abs(livePos - lastServerSavedPos) >= 3) {
      saveCurrentProgress();
    }
    updateMediaSession(
      true,
      store.currentAudio,
      store.currentEpisode,
      livePos,
      store.duration,
      store.playbackRate
    );
    return;
  }

  let currentPos = store.currentTime;
  if (ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
    try {
      const absTime = ytPlayerInstance.getCurrentTime();
      const startSec = store.currentEpisode?.startSeconds || 0;
      const epPos = Math.round(absTime - startSec);
      if (epPos >= 0) {
        currentPos = epPos;
        usePlayerStore.setState({ currentTime: epPos });
      }
    } catch {}
  }

  if (now - lastServerSaveAt >= 15000 && Math.abs(currentPos - lastServerSavedPos) >= 3) {
    saveCurrentProgress();
  }

  // Re-enforce playback rate on each worker tick to catch background rate resets
  if (ytPlayerInstance && typeof ytPlayerInstance.getPlaybackRate === 'function') {
    try {
      const actualRate = ytPlayerInstance.getPlaybackRate();
      const desiredRate = store.playbackRate || 1.0;
      if (desiredRate !== 1.0 && Math.abs(actualRate - desiredRate) > 0.05) {
        rateCoordinator.enforceRateWithRetries(desiredRate, 'worker_tick_rate_check');
      }
    } catch {}
  }

  updateMediaSession(
    true,
    store.currentAudio,
    store.currentEpisode,
    currentPos,
    store.duration,
    store.playbackRate
  );
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollIntervalHandler, 1000);
}

let watchdogDesyncCounter = 0;
let mediaSessionSyncCounter = 0;

function pollIntervalHandler() {
  const store = usePlayerStore.getState();
  if (!store.isPlaying) {
    watchdogDesyncCounter = 0;
    return;
  }

  // Kiểm tra sleep timer theo mốc thời gian tuyệt đối
  if (store.sleepTimerEndTimestamp && Date.now() >= store.sleepTimerEndTimestamp) {
    expireSleepTimerNow();
    return;
  }

  // Stream mode relies on native <audio> timeupdate; polling is only needed for sleep timer above.
  if (isStreamEngineActive(store)) {
    return;
  }

  if (ytPlayerInstance && typeof ytPlayerInstance.getCurrentTime === 'function') {
    try {
      const ytState = typeof ytPlayerInstance.getPlayerState === 'function' ? ytPlayerInstance.getPlayerState() : null;
      if (ytState === 1 && !rateCoordinator.isBusyApplying()) {
        const actualRate = ytPlayerInstance.getPlaybackRate();
        const targetRate = store.playbackRate || 1.0;

        if (typeof actualRate === 'number' && Math.abs(actualRate - targetRate) > 0.05) {
          watchdogDesyncCounter++;
          if (watchdogDesyncCounter >= 2) {
            watchdogDesyncCounter = 0;
            rateCoordinator.applyRate('watchdog_poll_desync');
          }
        } else {
          watchdogDesyncCounter = 0;
        }
      } else {
        watchdogDesyncCounter = 0;
      }
    } catch {}

    if (store.isSeeking) return;

    try {
      const loadedId =
        typeof ytPlayerInstance.getVideoData === 'function'
          ? ytPlayerInstance.getVideoData()?.video_id
          : null;
      if (
        loadedId &&
        store.currentAudio?.youtubeVideoId &&
        loadedId !== store.currentAudio.youtubeVideoId
      ) {
        return;
      }

      const absTime = ytPlayerInstance.getCurrentTime();
      const startSec = store.currentEpisode?.startSeconds || 0;
      const endSec = store.currentEpisode?.endSeconds || store.duration;

      const epPos = Math.round(absTime - startSec);
      if (epPos >= 0) {
        usePlayerStore.setState({ currentTime: epPos });
      }

      mediaSessionSyncCounter++;
      if (mediaSessionSyncCounter >= 3) {
        mediaSessionSyncCounter = 0;
        updateMediaSession(
          true,
          store.currentAudio,
          store.currentEpisode,
          epPos,
          store.duration,
          store.playbackRate
        );
      }

      if (!store.isSeeking && Date.now() >= ytTrackSwitchUntil && absTime >= endSec && endSec > startSec) {
        if (isEpisodeVipBlocked(store.currentAudio!, store.currentEpisode!)) {
          try {
            ytPlayerInstance.pauseVideo();
            ytPlayerInstance.seekTo(endSec, true);
          } catch {}
        }
        store.handleEpisodeComplete();
        return;
      }
    } catch {
      // Ignore
    }
  } else {
    // Local fallback tick
    const next = store.currentTime + 1 * (store.playbackRate || 1);
    if (next >= store.duration) {
      store.handleEpisodeComplete();
    } else {
      usePlayerStore.setState({ currentTime: next });
    }
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    saveCurrentProgress();
  }, 30000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function debouncedSaveProgress() {
  if (progressDebounceTimer) clearTimeout(progressDebounceTimer);
  progressDebounceTimer = setTimeout(() => {
    saveCurrentProgress();
  }, 500);
}

function navigateToAppRoute(path: string) {
  if (typeof window === 'undefined') return;
  const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  if (isTestEnv || window.location.hash.startsWith('#/')) {
    window.location.hash = `#${path}`;
  } else {
    window.location.assign(path);
  }
}

function saveLocalSnapshot(audio: AudioItem, episode: Episode, currentTime: number, duration: number) {
  if (!audio || !episode) return;
  const dur = duration || episode.duration || (episode.endSeconds - episode.startSeconds) || 14400;
  const percent = Math.min(100, Math.round((currentTime / Math.max(1, dur)) * 100));
  saveLocalProgressSnapshot({
    audioId: audio.id,
    episodeId: episode.id,
    episodeNumber: episode.episodeNumber,
    positionSeconds: currentTime,
    duration: dur,
    progressPercent: percent,
    updatedAt: Date.now(),
  });
  saveLastPlaybackSession(audio, episode, currentTime, dur);
}

let lastHistoryTrackKey = '';
let lastHistoryPositionSec = 0;

function saveProgressFor(audio: AudioItem, episode: Episode, currentTime: number, duration: number) {
  if (!audio || !episode) return;

  const dur = duration || episode.duration || (episode.endSeconds - episode.startSeconds) || 14400;
  const percent = Math.min(100, Math.round((currentTime / dur) * 100));
  const isCompleted = percent >= 95;

  audio.lastPositionSeconds = currentTime;
  audio.progressPercent = percent;
  audio.formattedPosition = formatTime(currentTime);
  audio.currentEpisodeId = episode.id;
  audio.currentEpisodeNumber = episode.episodeNumber;
  audio.currentEpisodeTitle = episode.title;
  episode.positionSeconds = currentTime;
  episode.progressPercent = percent;
  if (isCompleted) episode.completed = true;

  saveLocalSnapshot(audio, episode, currentTime, dur);

  lastServerSaveAt = Date.now();
  lastServerSavedPos = currentTime;

  api.progress.updateProgress({
    audioId: audio.id,
    episodeId: episode.id,
    positionSeconds: currentTime,
    progressPercent: percent,
    completed: isCompleted,
  });

  const trackKey = `${audio.id}:${episode.id}`;
  const isSameTrackKey = lastHistoryTrackKey === trackKey;
  let deltaSeconds = 0;
  if (isSameTrackKey) {
    const diff = Math.floor(currentTime - lastHistoryPositionSec);
    if (diff > 0 && diff <= 300) {
      deltaSeconds = diff;
    }
  } else {
    deltaSeconds = Math.min(Math.floor(currentTime), 120);
  }
  lastHistoryTrackKey = trackKey;
  lastHistoryPositionSec = currentTime;

  const prevDuration = episode.startSeconds || 0;
  const accumulatedDuration = prevDuration + currentTime;
  const hasAuthToken =
    typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('auth_token'));

  if (deltaSeconds >= 10 || (!hasAuthToken && !isSameTrackKey)) {
    api.history.recordHistory({
      audioId: audio.id,
      episodeId: episode.id,
      durationListened: Math.max(deltaSeconds, 1),
      totalDurationListened: accumulatedDuration,
      audio,
      episode,
      positionSeconds: currentTime,
      progressPercent: percent,
    });
  }

  try {
    const isTabHidden = typeof document !== 'undefined' && document.hidden;
    queryClient.invalidateQueries({ queryKey: ['audios'] });
    if (!isTabHidden) {
      queryClient.invalidateQueries({ queryKey: ['audio'] });
    }
    queryClient.invalidateQueries({ queryKey: ['history'] });
    queryClient.invalidateQueries({ queryKey: ['recent-history'] });
  } catch {}
}

function saveCurrentProgress() {
  const { currentAudio, currentEpisode, duration } = usePlayerStore.getState();
  if (!currentAudio || !currentEpisode) return;
  const livePos = getLivePlaybackPositionSeconds();
  saveProgressFor(currentAudio, currentEpisode, livePos, duration);
}

function flushProgressWithKeepalive() {
  const { currentAudio, currentEpisode, duration } = usePlayerStore.getState();
  if (!currentAudio || !currentEpisode) return;
  const livePos = getLivePlaybackPositionSeconds();
  const dur = duration || currentEpisode.duration || (currentEpisode.endSeconds - currentEpisode.startSeconds) || 14400;
  const percent = Math.min(100, Math.round((livePos / Math.max(1, dur)) * 100));
  saveLocalSnapshot(currentAudio, currentEpisode, livePos, dur);

  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (token && typeof fetch === 'function') {
      void fetch(`${API_BASE}/progress`, {
        method: 'PUT',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          audioId: currentAudio.id,
          episodeId: currentEpisode.id,
          positionSeconds: livePos,
          progressPercent: percent,
          completed: percent >= 95,
        }),
      }).catch(() => {});
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushProgressWithKeepalive();
  });
  window.addEventListener('pagehide', () => {
    flushProgressWithKeepalive();
  });
  document.addEventListener('freeze', () => {
    flushProgressWithKeepalive();
  });
  window.__playerStore = usePlayerStore;
  window.__measureProgressionRate = measureProgressionRate;

  document.addEventListener('visibilitychange', () => {
    const store = usePlayerStore.getState();
    if (document.visibilityState === 'hidden') {
      if (store.currentAudio && store.currentEpisode) {
        saveCurrentProgress();
        flushProgressWithKeepalive();
      }
      return;
    }

    if (document.visibilityState === 'visible') {
      if (isStreamEngineActive(store)) {
        const livePos = getLivePlaybackPositionSeconds();
        if (store.currentAudio && livePos !== store.currentTime) {
          usePlayerStore.setState({ currentTime: livePos });
        }
        // Recover unexpected OS background pause if user never pressed Pause
        if (store.isPlaying && !store.isExplicitlyPaused && htmlAudioEngine.isPaused()) {
          void htmlAudioEngine.play();
        }
        // Refresh mediaSession position when user returns to foreground
        if (store.currentAudio) {
          updateMediaSession(
            store.isPlaying,
            store.currentAudio,
            store.currentEpisode,
            livePos,
            store.duration,
            store.playbackRate
          );
        }
        return;
      }

      if (store.isPlaying && !store.isExplicitlyPaused) {
        setTimeout(() => {
          if (ytPlayerInstance && typeof ytPlayerInstance.getPlayerState === 'function') {
            try {
              const state = ytPlayerInstance.getPlayerState();
              if (state === 2 || state === -1) {
                ytPlayerInstance.playVideo();
                rateCoordinator.applyRate('visibility_resume');
              }
            } catch {}
          }
        }, 300);
      }
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'AUDIO_KEEPALIVE_ACK') {
        // SW alive ACK
      }
    });
  }
}

function updateMediaSession(
  playing: boolean,
  audio: AudioItem | null,
  episode: Episode | null,
  currentTime?: number,
  duration?: number,
  playbackRate?: number
) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

  if (!audio) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    (['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'seekto'] as const).forEach(
      (action) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
    );
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: episode?.title || audio.title,
    artist: audio.author || 'WaveLink Audio',
    album: audio.title,
    artwork: [
      { src: audio.thumbnailUrl || '/wavelink-icon.png', sizes: '512x512', type: 'image/png' },
      { src: audio.thumbnailUrl || '/wavelink-icon.png', sizes: '192x192', type: 'image/png' },
    ],
  });

  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';

  if ('setPositionState' in navigator.mediaSession && duration && duration > 0) {
    try {
      const curPos = Math.max(0, Math.min(currentTime || 0, duration));
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: playbackRate || 1.0,
        position: curPos,
      });
    } catch {}
  }

  try {
    navigator.mediaSession.setActionHandler('play', () => {
      usePlayerStore.getState().resume();
    });
  } catch {}

  try {
    navigator.mediaSession.setActionHandler('pause', () => {
      usePlayerStore.getState().pause();
    });
  } catch {}

  try {
    navigator.mediaSession.setActionHandler('stop', () => {
      usePlayerStore.getState().pause();
    });
  } catch {}

  const ios = isIOSDevice();
  try {
    navigator.mediaSession.setActionHandler(
      'seekbackward',
      ios
        ? null
        : (details) => {
            const skipSec = details.seekOffset ?? 10;
            usePlayerStore.getState().skipSeconds(-skipSec);
          }
    );
  } catch {}

  try {
    navigator.mediaSession.setActionHandler(
      'seekforward',
      ios
        ? null
        : (details) => {
            const skipSec = details.seekOffset ?? 30;
            usePlayerStore.getState().skipSeconds(skipSec);
          }
    );
  } catch {}

  try {
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      usePlayerStore.getState().prevEpisode();
    });
  } catch {}

  try {
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      usePlayerStore.getState().nextEpisode();
    });
  } catch {}

  try {
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) {
        usePlayerStore.getState().seekTo(details.seekTime);
      }
    });
  } catch {}
}
