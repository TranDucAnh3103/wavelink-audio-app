import type { StreamTokenResponse } from '@/types';
import { buildStreamUrl, markVideoStreamFailed } from '@/lib/streamConfig';
import {
  AudioEngine,
  AudioEngineError,
  AudioEngineEvents,
  AudioEngineLoadOptions,
} from './AudioEngine';

export type StreamTokenFetcher = (
  audioId: number | string,
  episodeId?: number,
  episodeNumber?: number
) => Promise<StreamTokenResponse>;

const MAX_STREAM_RETRIES = 5;
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 15000];
const TOKEN_REFRESH_AGE_MS = 4 * 60 * 60 * 1000; // Refresh 6h stream token proactively after 4h

function applyPreservesPitch(el: HTMLAudioElement): void {
  const media = el as HTMLAudioElement & {
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  try {
    media.preservesPitch = true;
    media.mozPreservesPitch = true;
    media.webkitPreservesPitch = true;
  } catch {}
}

/**
 * Direct HTML5 <audio> engine backed by WaveLink's Range-capable stream proxy.
 * Preserves the exact same `src` across virtual chapters on the same videoId so iOS/Android
 * background playback is never interrupted at chapter boundaries.
 */
export class HtmlAudioEngine implements AudioEngine {
  readonly type = 'stream' as const;

  private el: HTMLAudioElement | null = null;
  private tokenFetcher: StreamTokenFetcher | null = null;

  constructor(tokenFetcher?: StreamTokenFetcher) {
    if (tokenFetcher) {
      this.tokenFetcher = tokenFetcher;
    }
  }

  setTokenFetcher(tokenFetcher: StreamTokenFetcher): void {
    this.tokenFetcher = tokenFetcher;
  }
  private listeners: { [K in keyof AudioEngineEvents]: Set<AudioEngineEvents[K]> } = {
    time: new Set(),
    state: new Set(),
    duration: new Set(),
    rate: new Set(),
    ended: new Set(),
    error: new Set(),
    readyForSwap: new Set(),
    retrying: new Set(),
  };

  private currentOpts: AudioEngineLoadOptions | null = null;
  private currentVideoId: string | null = null;
  private loadedVideoId: string | null = null;
  private loadingNewStream = false;
  private pendingStartSeconds = 0;
  private pendingAutoplay = false;
  private pendingRate = 1.0;
  private metadataApplied = false;
  private silentPreload = false;
  private readyForSwapEmitted = false;
  private shouldBePlaying = false;
  private lastProgressTime = -1;
  private lastProgressAt = 0;
  private loadStartedAt = 0;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineCleanup: (() => void) | null = null;
  private tokenIssuedAt = 0;
  private loadSeq = 0;
  private stopped = false;
  private boundCleanup: (() => void) | null = null;

  getLoadedVideoId(): string | null {
    if (this.loadingNewStream || !this.metadataApplied || this.stopped) return null;
    return this.loadedVideoId;
  }

  isLoading(): boolean {
    return this.loadingNewStream && !this.stopped;
  }

  isPreloadedFor(videoId: string): boolean {
    return Boolean(
      !this.stopped &&
        this.currentVideoId === videoId &&
        this.metadataApplied &&
        this.el &&
        this.el.readyState >= 2
    );
  }

  updatePendingStartSeconds(seconds: number): void {
    const target = Math.max(0, seconds || 0);
    this.pendingStartSeconds = target;
    if (this.el && this.metadataApplied && !this.loadingNewStream && this.silentPreload) {
      try {
        this.el.currentTime = target;
      } catch {}
    }
  }

  convertToSilentPreload(): void {
    this.silentPreload = true;
    this.readyForSwapEmitted = false;
    this.pendingAutoplay = false;
    this.shouldBePlaying = false;
    this.clearWatchdogTimer();
    if (this.el) {
      this.el.muted = true;
      try {
        if (!this.el.paused) {
          this.el.pause();
        }
      } catch {}
    }
    if (
      this.metadataApplied &&
      !this.loadingNewStream &&
      this.el &&
      this.el.readyState >= 2 &&
      this.currentVideoId
    ) {
      this.readyForSwapEmitted = true;
      this.emit('readyForSwap', this.currentVideoId);
    }
  }

  isPaused(): boolean {
    return !this.el || this.el.paused;
  }

  attachElement(el: HTMLAudioElement | null): void {
    if (this.el === el) return;
    if (this.boundCleanup) {
      this.boundCleanup();
      this.boundCleanup = null;
    }
    this.el = el;
    if (!el) return;

    const onTimeUpdate = () => {
      if (this.loadingNewStream || !this.metadataApplied || this.stopped || el.seeking) return;
      if (this.silentPreload) return;
      this.lastProgressTime = el.currentTime || 0;
      this.lastProgressAt = Date.now();
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      this.emit('time', el.currentTime || 0, dur);
    };

    const onLoadedMetadata = () => {
      if (!this.metadataApplied) {
        try {
          el.currentTime = this.pendingStartSeconds;
        } catch {}
        applyPreservesPitch(el);
        try {
          el.playbackRate = this.pendingRate || 1.0;
        } catch {}
        this.metadataApplied = true;
        this.loadingNewStream = false;
        this.loadedVideoId = this.currentVideoId;
      }
      this.clearWatchdogTimer();
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      if (dur > 0) {
        this.emit('duration', dur);
      }
      if (this.silentPreload) {
        if (el.readyState >= 2 && !this.readyForSwapEmitted && this.currentVideoId) {
          this.readyForSwapEmitted = true;
          this.emit('readyForSwap', this.currentVideoId);
        }
        return;
      }
      if (this.pendingAutoplay && el.paused && !this.stopped) {
        this.pendingAutoplay = false;
        el.play().catch((err) => {
          this.handlePlayRejection(err);
        });
      }
    };

    const onCanPlay = () => {
      if (this.stopped) return;
      this.clearWatchdogTimer();
      if (this.silentPreload) {
        if (this.metadataApplied && !this.readyForSwapEmitted && this.currentVideoId) {
          this.readyForSwapEmitted = true;
          this.emit('readyForSwap', this.currentVideoId);
        }
        return;
      }
      if (this.shouldBePlaying && el.paused) {
        this.pendingAutoplay = false;
        el.play().catch((err) => {
          this.handlePlayRejection(err);
        });
      }
    };

    const onDurationChange = () => {
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      if (dur > 0) {
        this.emit('duration', dur);
      }
    };

    const onPlaying = () => {
      if (this.silentPreload) return;
      this.retryCount = 0;
      this.clearWatchdogTimer();
      this.lastProgressTime = el.currentTime || 0;
      this.lastProgressAt = Date.now();
      this.emit('state', 'playing');
    };

    const onPause = () => {
      if (this.silentPreload) return;
      if (!el.ended) {
        this.emit('state', 'paused');
      }
    };

    const onWaiting = () => {
      if (this.silentPreload || this.stopped) return;
      this.emit('state', 'buffering');
      if (this.shouldBePlaying) {
        this.armWatchdogTimer(18000);
      }
    };

    const onStalled = () => {
      if (this.silentPreload || this.stopped) return;
      if (this.shouldBePlaying) {
        this.emit('state', 'buffering');
        this.armWatchdogTimer(18000);
      }
    };

    const onSeeking = () => {
      if (this.silentPreload || this.stopped) return;
      if (this.shouldBePlaying && el.readyState < 3) {
        this.emit('state', 'buffering');
      }
    };

    const onSeeked = () => {
      if (this.silentPreload || this.stopped) return;
      if (!el.paused && el.readyState >= 3) {
        this.clearWatchdogTimer();
        this.emit('state', 'playing');
      }
    };

    const onEnded = () => {
      if (this.silentPreload || this.loadingNewStream || !this.metadataApplied || this.stopped) return;
      this.clearWatchdogTimer();
      this.emit('state', 'ended');
      this.emit('ended');
    };

    const onRateChange = () => {
      if (this.silentPreload) return;
      this.emit('rate', el.playbackRate || 1.0);
    };

    const onError = () => {
      this.handleMediaError();
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('stalled', onStalled);
    el.addEventListener('seeking', onSeeking);
    el.addEventListener('seeked', onSeeked);
    el.addEventListener('ended', onEnded);
    el.addEventListener('ratechange', onRateChange);
    el.addEventListener('error', onError);

    this.boundCleanup = () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('stalled', onStalled);
      el.removeEventListener('seeking', onSeeking);
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('ratechange', onRateChange);
      el.removeEventListener('error', onError);
    };
  }

  isReady(): boolean {
    return Boolean(this.el);
  }

  async load(options: AudioEngineLoadOptions): Promise<void> {
    this.clearRetryTimer();
    this.clearWatchdogTimer();
    this.stopped = false;

    const el = this.el;
    if (!el) {
      this.currentOpts = options;
      this.currentVideoId = options.videoId;
      this.pendingStartSeconds = Math.max(0, options.startSeconds || 0);
      this.pendingAutoplay = options.silentPreload ? false : options.autoplay;
      this.shouldBePlaying = options.silentPreload ? false : options.autoplay;
      this.pendingRate = options.playbackRate || 1.0;
      this.silentPreload = Boolean(options.silentPreload);
      return;
    }

    // In-flight load for the same videoId: update target position/mode without restarting token fetch
    if (
      this.currentVideoId === options.videoId &&
      this.loadingNewStream &&
      !options.forceReload
    ) {
      this.currentOpts = options;
      this.pendingStartSeconds = Math.max(0, options.startSeconds || 0);
      this.pendingRate = options.playbackRate || 1.0;
      this.silentPreload = Boolean(options.silentPreload);
      this.pendingAutoplay = this.silentPreload ? false : options.autoplay;
      this.shouldBePlaying = this.silentPreload ? false : options.autoplay;
      el.muted = this.silentPreload;
      return;
    }

    const sameStreamLoaded =
      !options.forceReload &&
      this.metadataApplied &&
      this.currentVideoId === options.videoId &&
      Boolean(el.currentSrc || el.src) &&
      !el.error &&
      (this.tokenIssuedAt === 0 || Date.now() - this.tokenIssuedAt < TOKEN_REFRESH_AGE_MS);

    this.currentOpts = options;
    this.pendingRate = options.playbackRate || 1.0;

    // Virtual chapter switch on the same stream: seek in-place without reloading src.
    if (sameStreamLoaded) {
      this.silentPreload = Boolean(options.silentPreload);
      el.muted = this.silentPreload;
      this.shouldBePlaying = this.silentPreload ? false : options.autoplay;
      applyPreservesPitch(el);
      try {
        el.playbackRate = this.pendingRate;
      } catch {}
      const target = Math.max(0, options.startSeconds || 0);
      this.pendingStartSeconds = target;
      if (Math.abs((el.currentTime || 0) - target) > 1.0) {
        try {
          el.currentTime = target;
        } catch {}
        if (!this.silentPreload && this.shouldBePlaying && el.readyState < 3) {
          this.emit('state', 'buffering');
        }
      }
      if (this.silentPreload) {
        if (el.readyState >= 2 && !this.readyForSwapEmitted && this.currentVideoId) {
          this.readyForSwapEmitted = true;
          this.emit('readyForSwap', this.currentVideoId);
        }
        return;
      }
      if (options.autoplay && el.paused) {
        await this.play();
      } else if (!el.paused && el.readyState >= 3) {
        this.emit('state', 'playing');
      }
      return;
    }

    const seq = ++this.loadSeq;
    this.loadingNewStream = true;
    this.metadataApplied = false;
    this.loadedVideoId = null;
    this.currentVideoId = options.videoId;
    this.pendingStartSeconds = Math.max(0, options.startSeconds || 0);
    this.silentPreload = Boolean(options.silentPreload);
    this.readyForSwapEmitted = false;
    this.pendingAutoplay = this.silentPreload ? false : options.autoplay;
    this.shouldBePlaying = this.silentPreload ? false : options.autoplay;
    this.loadStartedAt = Date.now();
    this.lastProgressAt = Date.now();
    this.lastProgressTime = -1;
    this.retryCount = 0;
    try {
      el.pause();
    } catch {}
    el.muted = this.silentPreload;
    if (!this.silentPreload) {
      this.emit('state', 'loading');
    }

    try {
      if (!this.tokenFetcher) {
        throw new Error('Stream token fetcher is not configured');
      }
      const tokenRes = await this.tokenFetcher(
        options.audioId,
        options.episodeId,
        options.episodeNumber
      );
      if (seq !== this.loadSeq || this.stopped) return;

      this.tokenIssuedAt = Date.now();
      const streamUrl = buildStreamUrl(tokenRes.streamUrl, options.videoId, tokenRes.streamToken);
      applyPreservesPitch(el);
      try {
        el.playbackRate = this.pendingRate;
      } catch {}
      el.preload = this.silentPreload ? 'auto' : 'metadata';
      el.src = streamUrl;
      el.load();

      if (el.readyState >= 1) {
        try {
          el.currentTime = this.pendingStartSeconds;
        } catch {}
        this.metadataApplied = true;
        this.loadingNewStream = false;
        this.loadedVideoId = this.currentVideoId;
        if (this.silentPreload) {
          if (el.readyState >= 2 && !this.readyForSwapEmitted && this.currentVideoId) {
            this.readyForSwapEmitted = true;
            this.emit('readyForSwap', this.currentVideoId);
          }
        } else if (this.pendingAutoplay && el.paused) {
          this.pendingAutoplay = false;
          await this.play();
        }
      } else if (!this.silentPreload && this.shouldBePlaying) {
        this.armWatchdogTimer(18000);
      }
    } catch (err: unknown) {
      if (seq !== this.loadSeq || this.stopped) return;
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 403) {
        this.loadingNewStream = false;
        this.emitError({
          message: apiErr.message || 'Tập này yêu cầu tài khoản VIP để phát.',
          fatal: true,
          shouldFallbackToYouTube: false,
          code: 'VIP_FORBIDDEN',
        });
        return;
      }

      if (this.silentPreload) {
        if (typeof apiErr?.status === 'number' && apiErr.status >= 400) {
          markVideoStreamFailed(options.videoId);
        }
        this.stop();
        this.emitError({
          message: apiErr?.message || 'Preload stream thất bại.',
          fatal: false,
          shouldFallbackToYouTube: false,
          code: 'PRELOAD_FAILED',
        });
        return;
      }

      // If offline on initial load, wait for connectivity rather than abandoning stream mode
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.handleOfflineWait(seq);
        return;
      }

      this.loadingNewStream = false;
      markVideoStreamFailed(options.videoId);
      this.emitError({
        message: apiErr?.message || 'Không thể lấy liên kết stream trực tiếp.',
        fatal: true,
        shouldFallbackToYouTube: true,
        code: 'TOKEN_FAILED',
      });
    }
  }

  async commitSwapFromYouTube(
    targetSeconds: number,
    playbackRate: number,
    beforeUnmutePlay?: () => void
  ): Promise<boolean> {
    const el = this.el;
    if (!el || this.stopped || !this.metadataApplied) return false;

    const validRate = playbackRate > 0 ? playbackRate : 1.0;
    const clampedTarget = Math.max(0, targetSeconds || 0);

    this.silentPreload = false;
    this.shouldBePlaying = true;
    this.pendingAutoplay = false;
    this.pendingRate = validRate;
    this.pendingStartSeconds = clampedTarget;

    el.muted = true;
    applyPreservesPitch(el);
    try {
      el.playbackRate = validRate;
    } catch {}

    if (Math.abs((el.currentTime || 0) - clampedTarget) > 0.8) {
      try {
        el.currentTime = clampedTarget;
      } catch {}
      if (el.seeking) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            el.removeEventListener('seeked', finish);
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(finish, 500);
          el.addEventListener('seeked', finish, { once: true });
        });
      }
    }

    if (this.stopped || !this.el) return false;

    try {
      beforeUnmutePlay?.();
    } catch {}

    el.muted = false;
    try {
      el.volume = 1;
    } catch {}

    try {
      await el.play();
      this.lastProgressAt = Date.now();
      this.lastProgressTime = el.currentTime || clampedTarget;
      return true;
    } catch (err) {
      const domErr = err as { name?: string };
      if (domErr?.name === 'AbortError') {
        return true;
      }
      // Roll back into muted/paused state so caller can safely keep YouTube playing
      el.muted = true;
      try {
        el.pause();
      } catch {}
      this.shouldBePlaying = false;
      this.silentPreload = true;
      return false;
    }
  }

  async play(): Promise<void> {
    if (!this.el) return;
    this.stopped = false;
    this.silentPreload = false;
    this.shouldBePlaying = true;
    this.el.muted = false;
    applyPreservesPitch(this.el);
    try {
      this.el.playbackRate = this.pendingRate || 1.0;
    } catch {}
    try {
      await this.el.play();
      this.lastProgressAt = Date.now();
    } catch (err) {
      this.handlePlayRejection(err);
    }
  }

  pause(): void {
    this.pendingAutoplay = false;
    this.shouldBePlaying = false;
    this.clearRetryTimer();
    this.clearWatchdogTimer();
    if (!this.el) return;
    try {
      this.el.pause();
    } catch {}
  }

  async forceRetry(): Promise<void> {
    if (!this.currentOpts || !this.el) return;
    const lastTime =
      this.el.currentTime && Number.isFinite(this.el.currentTime) && this.el.currentTime > 0
        ? this.el.currentTime
        : this.pendingStartSeconds;
    const opts: AudioEngineLoadOptions = {
      ...this.currentOpts,
      startSeconds: lastTime,
      autoplay: true,
      silentPreload: false,
      forceReload: true,
    };
    this.retryCount = 0;
    await this.load(opts);
  }

  checkHealth(): void {
    if (!this.el || this.stopped || this.silentPreload || !this.shouldBePlaying) return;
    if (this.retryTimer || this.onlineCleanup) return;

    const now = Date.now();
    // Stalled during initial load (e.g. screen turned off before metadata arrived)
    if (this.loadingNewStream && this.loadStartedAt > 0 && now - this.loadStartedAt >= 12000 && this.el.readyState < 2) {
      this.handleMediaError();
      return;
    }

    // Stalled or unexpectedly paused by OS after metadata loaded
    if (this.metadataApplied) {
      if (this.el.paused && this.el.readyState >= 2) {
        void this.play();
        return;
      }
      if (this.el.readyState < 3 && this.lastProgressAt > 0 && now - this.lastProgressAt >= 12000) {
        this.handleMediaError();
      }
    }
  }

  seek(absoluteSeconds: number): void {
    const target = Math.max(0, absoluteSeconds || 0);
    this.pendingStartSeconds = target;
    if (!this.el) return;
    try {
      this.el.currentTime = target;
    } catch {}
  }

  setRate(rate: number): void {
    const validRate = rate > 0 ? rate : 1.0;
    this.pendingRate = validRate;
    if (!this.el) return;
    applyPreservesPitch(this.el);
    try {
      this.el.playbackRate = validRate;
      this.emit('rate', validRate);
    } catch {}
  }

  setVolume(volume: number): void {
    if (!this.el) return;
    try {
      this.el.volume = Math.max(0, Math.min(1, volume));
    } catch {}
  }

  getVolume(): number {
    if (!this.el) return 1;
    return typeof this.el.volume === 'number' ? this.el.volume : 1;
  }

  getTime(): number {
    if (this.loadingNewStream || !this.metadataApplied) return this.pendingStartSeconds;
    if (!this.el) return 0;
    return Number.isFinite(this.el.currentTime) ? this.el.currentTime : 0;
  }

  getDuration(): number {
    if (!this.el) return 0;
    return Number.isFinite(this.el.duration) && this.el.duration > 0 ? this.el.duration : 0;
  }

  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  stop(): void {
    this.stopped = true;
    this.loadingNewStream = false;
    this.metadataApplied = false;
    this.silentPreload = false;
    this.readyForSwapEmitted = false;
    this.shouldBePlaying = false;
    this.loadedVideoId = null;
    this.loadSeq++;
    this.clearRetryTimer();
    this.clearWatchdogTimer();
    this.pendingAutoplay = false;
    this.currentOpts = null;
    this.currentVideoId = null;
    if (!this.el) return;
    try {
      this.el.pause();
      this.el.muted = false;
      this.el.removeAttribute('src');
      this.el.load();
    } catch {}
    this.emit('state', 'idle');
  }

  destroy(): void {
    this.stop();
    if (this.boundCleanup) {
      this.boundCleanup();
      this.boundCleanup = null;
    }
    this.el = null;
  }

  private handlePlayRejection(err: unknown): void {
    const domErr = err as { name?: string; message?: string };
    // AbortError happens naturally when play() is interrupted by pause()/seek()
    if (domErr?.name === 'AbortError') return;
    if (domErr?.name === 'NotAllowedError') {
      this.emit('state', 'paused');
      this.emitError({
        message: 'Trình duyệt yêu cầu thao tác chạm để bắt đầu phát âm thanh.',
        fatal: false,
        shouldFallbackToYouTube: false,
        code: 'AUTOPLAY_BLOCKED',
      });
    }
  }

  private handleOfflineWait(seq: number): void {
    if (!this.currentOpts || !this.el) return;
    const opts = this.currentOpts;
    const lastTime =
      this.el.currentTime && Number.isFinite(this.el.currentTime) && this.el.currentTime > 0
        ? this.el.currentTime
        : this.pendingStartSeconds;
    this.clearRetryTimer();
    this.clearWatchdogTimer();
    this.pendingStartSeconds = lastTime;
    this.emit('state', 'buffering');
    const onOnline = () => {
      if (this.onlineCleanup) {
        this.onlineCleanup();
        this.onlineCleanup = null;
      }
      if (seq !== this.loadSeq || this.stopped) return;
      void this.load({
        ...opts,
        startSeconds: lastTime,
        autoplay: true,
        silentPreload: false,
        forceReload: true,
      });
    };
    window.addEventListener('online', onOnline, { once: true });
    this.onlineCleanup = () => window.removeEventListener('online', onOnline);
  }

  private handleMediaError(): void {
    const opts = this.currentOpts;
    if (!opts || this.stopped || !this.el) return;
    this.clearWatchdogTimer();

    if (this.silentPreload) {
      this.stop();
      this.emitError({
        message: 'Preload stream gặp lỗi.',
        fatal: false,
        shouldFallbackToYouTube: false,
        code: 'PRELOAD_FAILED',
      });
      return;
    }

    const lastTime =
      this.el.currentTime && Number.isFinite(this.el.currentTime) && this.el.currentTime > 0
        ? this.el.currentTime
        : this.pendingStartSeconds;

    const retryStreamReload = async (seq: number) => {
      if (seq !== this.loadSeq || this.stopped || !this.el || !this.currentOpts) return;
      try {
        if (!this.tokenFetcher) {
          throw new Error('Stream token fetcher is not configured');
        }
        const tokenRes = await this.tokenFetcher(
          opts.audioId,
          opts.episodeId,
          opts.episodeNumber
        );
        if (seq !== this.loadSeq || this.stopped || !this.el) return;

        this.tokenIssuedAt = Date.now();
        const baseStreamUrl = buildStreamUrl(tokenRes.streamUrl, opts.videoId, tokenRes.streamToken);
        const sep = baseStreamUrl.includes('?') ? '&' : '?';
        this.pendingStartSeconds = lastTime;
        this.pendingAutoplay = true;
        this.shouldBePlaying = true;
        this.metadataApplied = false;
        this.loadingNewStream = true;
        this.loadStartedAt = Date.now();
        this.el.src = `${baseStreamUrl}${sep}retry=${Date.now()}`;
        this.el.load();
        this.armWatchdogTimer(18000);
      } catch {
        this.handleMediaError();
      }
    };

    // Wait for connectivity restoration instead of burning retries during background network drop / Doze
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      const seq = this.loadSeq;
      this.clearRetryTimer();
      this.pendingStartSeconds = lastTime;
      this.emit('state', 'buffering');
      const onOnline = () => {
        if (this.onlineCleanup) {
          this.onlineCleanup();
          this.onlineCleanup = null;
        }
        void retryStreamReload(seq);
      };
      window.addEventListener('online', onOnline, { once: true });
      this.onlineCleanup = () => window.removeEventListener('online', onOnline);
      return;
    }

    if (this.retryCount < MAX_STREAM_RETRIES) {
      const delayMs = RETRY_DELAYS_MS[this.retryCount] ?? 15000;
      this.retryCount++;
      const seq = this.loadSeq;
      this.clearRetryTimer();
      this.emit('state', 'buffering');
      this.emit('retrying', this.retryCount, MAX_STREAM_RETRIES);

      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void retryStreamReload(seq);
      }, delayMs);
      return;
    }

    this.loadingNewStream = false;
    markVideoStreamFailed(opts.videoId);
    this.emitError({
      message: 'Luồng âm thanh trực tiếp gặp sự cố, đang chuyển sang trình phát dự phòng.',
      fatal: true,
      shouldFallbackToYouTube: true,
      code: 'STREAM_FAILED',
    });
  }

  private armWatchdogTimer(delayMs: number): void {
    this.clearWatchdogTimer();
    const seq = this.loadSeq;
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      if (seq !== this.loadSeq || this.stopped || this.silentPreload || !this.shouldBePlaying) return;
      if (!this.el || this.el.readyState < 3 || this.el.paused) {
        this.handleMediaError();
      }
    }, delayMs);
  }

  private clearWatchdogTimer(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.onlineCleanup) {
      this.onlineCleanup();
      this.onlineCleanup = null;
    }
  }

  private emit<K extends keyof AudioEngineEvents>(event: K, ...args: Parameters<AudioEngineEvents[K]>): void {
    this.listeners[event].forEach((fn) => {
      try {
        (fn as (...a: Parameters<AudioEngineEvents[K]>) => void)(...args);
      } catch {}
    });
  }

  private emitError(err: AudioEngineError): void {
    this.emit('error', err);
  }
}
