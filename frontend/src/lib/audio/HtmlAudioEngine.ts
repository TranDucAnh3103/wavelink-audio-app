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

const MAX_STREAM_RETRIES = 3;

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
  };

  private currentOpts: AudioEngineLoadOptions | null = null;
  private currentVideoId: string | null = null;
  private pendingStartSeconds = 0;
  private pendingAutoplay = false;
  private pendingRate = 1.0;
  private metadataApplied = false;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private loadSeq = 0;
  private stopped = false;
  private boundCleanup: (() => void) | null = null;

  attachElement(el: HTMLAudioElement | null): void {
    if (this.el === el) return;
    if (this.boundCleanup) {
      this.boundCleanup();
      this.boundCleanup = null;
    }
    this.el = el;
    if (!el) return;

    const onTimeUpdate = () => {
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      this.emit('time', el.currentTime || 0, dur);
    };

    const onLoadedMetadata = () => {
      if (!this.metadataApplied) {
        this.metadataApplied = true;
        if (this.pendingStartSeconds > 0) {
          try {
            el.currentTime = this.pendingStartSeconds;
          } catch {}
        }
        applyPreservesPitch(el);
        try {
          el.playbackRate = this.pendingRate || 1.0;
        } catch {}
      }
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      if (dur > 0) {
        this.emit('duration', dur);
      }
      if (this.pendingAutoplay && el.paused && !this.stopped) {
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
      this.retryCount = 0;
      this.emit('state', 'playing');
    };

    const onPause = () => {
      if (!el.ended) {
        this.emit('state', 'paused');
      }
    };

    const onWaiting = () => {
      this.emit('state', 'buffering');
    };

    const onEnded = () => {
      this.emit('state', 'ended');
      this.emit('ended');
    };

    const onRateChange = () => {
      this.emit('rate', el.playbackRate || 1.0);
    };

    const onError = () => {
      this.handleMediaError();
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('ended', onEnded);
    el.addEventListener('ratechange', onRateChange);
    el.addEventListener('error', onError);

    this.boundCleanup = () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
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
    this.stopped = false;

    const el = this.el;
    if (!el) {
      this.currentOpts = options;
      this.currentVideoId = options.videoId;
      this.pendingStartSeconds = Math.max(0, options.startSeconds || 0);
      this.pendingAutoplay = options.autoplay;
      this.pendingRate = options.playbackRate || 1.0;
      return;
    }

    const sameStreamLoaded =
      this.currentVideoId === options.videoId &&
      Boolean(el.currentSrc || el.src) &&
      !el.error;

    this.currentOpts = options;
    this.pendingRate = options.playbackRate || 1.0;

    // Virtual chapter switch on the same stream: seek in-place without reloading src.
    if (sameStreamLoaded) {
      applyPreservesPitch(el);
      try {
        el.playbackRate = this.pendingRate;
      } catch {}
      const target = Math.max(0, options.startSeconds || 0);
      if (Math.abs((el.currentTime || 0) - target) > 1.0) {
        try {
          el.currentTime = target;
        } catch {}
      }
      if (options.autoplay && el.paused) {
        await this.play();
      }
      return;
    }

    const seq = ++this.loadSeq;
    this.currentVideoId = options.videoId;
    this.pendingStartSeconds = Math.max(0, options.startSeconds || 0);
    this.pendingAutoplay = options.autoplay;
    this.metadataApplied = false;
    this.retryCount = 0;
    this.emit('state', 'loading');

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

      const streamUrl = buildStreamUrl(tokenRes.streamUrl, options.videoId, tokenRes.streamToken);
      applyPreservesPitch(el);
      try {
        el.playbackRate = this.pendingRate;
      } catch {}
      el.preload = 'metadata';
      el.src = streamUrl;
      el.load();

      if (el.readyState >= 1) {
        this.metadataApplied = true;
        if (this.pendingStartSeconds > 0) {
          try {
            el.currentTime = this.pendingStartSeconds;
          } catch {}
        }
        if (this.pendingAutoplay && el.paused) {
          this.pendingAutoplay = false;
          await this.play();
        }
      }
    } catch (err: unknown) {
      if (seq !== this.loadSeq || this.stopped) return;
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 403) {
        this.emitError({
          message: apiErr.message || 'Tập này yêu cầu tài khoản VIP để phát.',
          fatal: true,
          shouldFallbackToYouTube: false,
          code: 'VIP_FORBIDDEN',
        });
        return;
      }
      markVideoStreamFailed(options.videoId);
      this.emitError({
        message: apiErr?.message || 'Không thể lấy liên kết stream trực tiếp.',
        fatal: true,
        shouldFallbackToYouTube: true,
        code: 'TOKEN_FAILED',
      });
    }
  }

  async play(): Promise<void> {
    if (!this.el) return;
    this.stopped = false;
    applyPreservesPitch(this.el);
    try {
      this.el.playbackRate = this.pendingRate || 1.0;
    } catch {}
    try {
      await this.el.play();
    } catch (err) {
      this.handlePlayRejection(err);
    }
  }

  pause(): void {
    this.pendingAutoplay = false;
    this.clearRetryTimer();
    if (!this.el) return;
    try {
      this.el.pause();
    } catch {}
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
    this.loadSeq++;
    this.clearRetryTimer();
    this.pendingAutoplay = false;
    this.currentOpts = null;
    this.currentVideoId = null;
    if (!this.el) return;
    try {
      this.el.pause();
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

  private handleMediaError(): void {
    const opts = this.currentOpts;
    if (!opts || this.stopped || !this.el) return;

    const lastTime =
      this.el.currentTime && Number.isFinite(this.el.currentTime) && this.el.currentTime > 0
        ? this.el.currentTime
        : this.pendingStartSeconds;

    if (this.retryCount < MAX_STREAM_RETRIES) {
      this.retryCount++;
      const delayMs = Math.pow(2, this.retryCount - 1) * 1000;
      const seq = this.loadSeq;
      this.clearRetryTimer();
      this.emit('state', 'buffering');

      this.retryTimer = setTimeout(async () => {
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

          const baseStreamUrl = buildStreamUrl(tokenRes.streamUrl, opts.videoId, tokenRes.streamToken);
          const sep = baseStreamUrl.includes('?') ? '&' : '?';
          this.pendingStartSeconds = lastTime;
          this.pendingAutoplay = true;
          this.metadataApplied = false;
          this.el.src = `${baseStreamUrl}${sep}retry=${Date.now()}`;
          this.el.load();
        } catch {
          this.handleMediaError();
        }
      }, delayMs);
      return;
    }

    markVideoStreamFailed(opts.videoId);
    this.emitError({
      message: 'Luồng âm thanh trực tiếp gặp sự cố, đang chuyển sang trình phát dự phòng.',
      fatal: true,
      shouldFallbackToYouTube: true,
      code: 'STREAM_FAILED',
    });
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
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
