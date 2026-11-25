import { API_BASE } from '@/lib/axiosClient';

export type AudioEngineMode = 'stream' | 'youtube';

interface RuntimeStreamEnv {
  STREAM_BASE_URL?: string;
  VITE_STREAM_BASE_URL?: string;
  AUDIO_ENGINE?: string;
  VITE_AUDIO_ENGINE?: string;
}

function getRuntimeEnv(): RuntimeStreamEnv | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __ENV__?: RuntimeStreamEnv }).__ENV__;
}

/**
 * Determines whether the frontend should use the Direct Audio Stream Proxy (`stream`)
 * or legacy YouTube IFrame (`youtube`).
 */
export function getAudioEngineMode(): AudioEngineMode {
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      __WAVELINK_MEDIA_BRIDGE__?: boolean;
      __WAVELINK_APP_STREAM_READY__?: boolean;
    };
    // Legacy APK webview ships an injected script that hijacks HTMLMediaElement.pause & Visibility API.
    // Until the user installs the updated APK (`__WAVELINK_APP_STREAM_READY__`), keep YouTube fallback safe.
    if (win.__WAVELINK_MEDIA_BRIDGE__ && !win.__WAVELINK_APP_STREAM_READY__) {
      return 'youtube';
    }

    try {
      const override = localStorage.getItem('wavelink_audio_engine_override');
      if (override === 'youtube' || override === 'stream') {
        return override;
      }
    } catch {}

    const runtimeMode = getRuntimeEnv()?.AUDIO_ENGINE || getRuntimeEnv()?.VITE_AUDIO_ENGINE;
    if (runtimeMode === 'youtube' || runtimeMode === 'stream') {
      return runtimeMode;
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    const envMode = process.env.NEXT_PUBLIC_AUDIO_ENGINE || process.env.VITE_AUDIO_ENGINE;
    if (envMode === 'youtube' || envMode === 'stream') {
      return envMode;
    }
  }

  return 'stream';
}

/**
 * Resolves the direct origin for `/stream/:videoId` requests.
 * Always targets the VPS / stream host directly rather than Next.js `/api/v1` rewrites.
 */
export function resolveStreamBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const rt = getRuntimeEnv();
    const runtimeUrl = rt?.STREAM_BASE_URL || rt?.VITE_STREAM_BASE_URL;
    if (runtimeUrl && runtimeUrl.trim().length > 0) {
      return runtimeUrl.trim().replace(/\/+$/, '');
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    const envUrl = process.env.NEXT_PUBLIC_STREAM_BASE_URL || process.env.VITE_STREAM_BASE_URL;
    if (envUrl && envUrl.trim().length > 0) {
      return envUrl.trim().replace(/\/+$/, '');
    }
  }

  // Derive origin from API_BASE (e.g. https://api.domain.com/api/v1 -> https://api.domain.com)
  const stripped = API_BASE.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
  if (stripped && /^https?:\/\//i.test(stripped)) {
    return stripped;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return 'http://localhost:8080';
}

/**
 * Builds the absolute playback URL for HTML5 <audio>.
 */
export function buildStreamUrl(streamUrlFromApi: string | undefined, videoId: string, token: string): string {
  if (streamUrlFromApi && /^https?:\/\//i.test(streamUrlFromApi)) {
    return streamUrlFromApi;
  }
  const base = resolveStreamBaseUrl();
  if (streamUrlFromApi && streamUrlFromApi.startsWith('/')) {
    return `${base}${streamUrlFromApi}`;
  }
  return `${base}/stream/${encodeURIComponent(videoId)}?st=${encodeURIComponent(token)}`;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const FAILED_VIDEOS_KEY = 'wavelink_stream_failed_videos';

export function markVideoStreamFailed(videoId: string): void {
  if (!videoId || typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(FAILED_VIDEOS_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.add(videoId);
    sessionStorage.setItem(FAILED_VIDEOS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export function isVideoStreamFailed(videoId: string): boolean {
  if (!videoId || typeof sessionStorage === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(FAILED_VIDEOS_KEY);
    if (!raw) return false;
    const arr: string[] = JSON.parse(raw);
    return Array.isArray(arr) && arr.includes(videoId);
  } catch {
    return false;
  }
}

export function clearVideoStreamFailed(videoId: string): void {
  if (!videoId || typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(FAILED_VIDEOS_KEY);
    if (!raw) return;
    const arr: string[] = JSON.parse(raw);
    sessionStorage.setItem(FAILED_VIDEOS_KEY, JSON.stringify(arr.filter((id) => id !== videoId)));
  } catch {}
}
