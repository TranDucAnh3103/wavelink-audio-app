export type AudioEngineType = 'stream' | 'youtube';

export type EnginePlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended';

export interface AudioEngineLoadOptions {
  audioId: number | string;
  videoId: string;
  episodeId?: number;
  episodeNumber?: number;
  startSeconds: number;
  autoplay: boolean;
  playbackRate: number;
  silentPreload?: boolean;
  forceReload?: boolean;
}

export interface AudioEngineError {
  message: string;
  fatal: boolean;
  shouldFallbackToYouTube: boolean;
  code?: string;
}

export interface AudioEngineEvents {
  time: (currentTimeSec: number, durationSec: number) => void;
  state: (state: EnginePlaybackState) => void;
  duration: (durationSec: number) => void;
  rate: (playbackRate: number) => void;
  ended: () => void;
  error: (err: AudioEngineError) => void;
  readyForSwap: (videoId: string) => void;
  retrying: (attempt: number, maxAttempts: number) => void;
}

export interface AudioEngine {
  readonly type: AudioEngineType;
  isReady(): boolean;
  load(options: AudioEngineLoadOptions): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(absoluteSeconds: number): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  getVolume(): number;
  getTime(): number;
  getDuration(): number;
  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]): () => void;
  stop(): void;
  destroy(): void;
}
