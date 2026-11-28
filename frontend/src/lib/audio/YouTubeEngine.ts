import { rateCoordinator } from '@/lib/playbackRateCoordinator';
import {
  AudioEngine,
  AudioEngineEvents,
  AudioEngineLoadOptions,
} from './AudioEngine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type YouTubePlayerLike = any;

/**
 * Adapter wrapping the legacy YouTube IFrame Player API behind the shared AudioEngine interface.
 */
export class YouTubeEngine implements AudioEngine {
  readonly type = 'youtube' as const;

  private player: YouTubePlayerLike = null;
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

  attachPlayer(player: YouTubePlayerLike, instanceId: string = 'yt-player-host'): void {
    this.player = player;
    if (player) {
      rateCoordinator.attachPlayer(player, instanceId);
    }
  }

  getPlayer(): YouTubePlayerLike {
    return this.player;
  }

  isReady(): boolean {
    return Boolean(this.player);
  }

  async load(options: AudioEngineLoadOptions): Promise<void> {
    rateCoordinator.onVideoLoaded(options.videoId);
    if (!this.player || typeof this.player.loadVideoById !== 'function') return;
    try {
      this.player.loadVideoById({
        videoId: options.videoId,
        startSeconds: Math.max(0, options.startSeconds || 0),
      });
      if (options.autoplay && typeof this.player.playVideo === 'function') {
        this.player.playVideo();
      }
    } catch {}
  }

  async play(): Promise<void> {
    if (!this.player || typeof this.player.playVideo !== 'function') return;
    try {
      this.player.playVideo();
      rateCoordinator.applyRate('yt_engine_play');
    } catch {}
  }

  pause(): void {
    if (!this.player || typeof this.player.pauseVideo !== 'function') return;
    try {
      this.player.pauseVideo();
    } catch {}
  }

  seek(absoluteSeconds: number): void {
    if (!this.player || typeof this.player.seekTo !== 'function') return;
    try {
      this.player.seekTo(Math.max(0, absoluteSeconds || 0), true);
      rateCoordinator.applyRate('yt_engine_seek');
    } catch {}
  }

  setRate(rate: number): void {
    rateCoordinator.setDesiredRate(rate, 'yt_engine_setRate');
  }

  setVolume(volume: number): void {
    if (!this.player || typeof this.player.setVolume !== 'function') return;
    try {
      this.player.setVolume(Math.max(0, Math.min(100, Math.round(volume * 100))));
    } catch {}
  }

  getVolume(): number {
    if (!this.player || typeof this.player.getVolume !== 'function') return 1;
    try {
      return (this.player.getVolume() || 100) / 100;
    } catch {
      return 1;
    }
  }

  getTime(): number {
    if (!this.player || typeof this.player.getCurrentTime !== 'function') return 0;
    try {
      return Number(this.player.getCurrentTime()) || 0;
    } catch {
      return 0;
    }
  }

  getDuration(): number {
    if (!this.player || typeof this.player.getDuration !== 'function') return 0;
    try {
      return Number(this.player.getDuration()) || 0;
    } catch {
      return 0;
    }
  }

  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  stop(): void {
    if (!this.player) return;
    try {
      // Never call stopVideo() because it triggers YT.PlayerState.ENDED (0).
      this.player.pauseVideo?.();
      this.player.seekTo?.(0, true);
    } catch {}
  }

  destroy(): void {
    this.stop();
    this.player = null;
  }
}
