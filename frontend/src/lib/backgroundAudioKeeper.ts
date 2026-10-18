/**
 * backgroundAudioKeeper.ts
 * Duy trì phiên âm thanh nền (Background Audio Session) cho WaveLink trên tất cả platforms,
 * đặc biệt tối ưu cho Android Chrome và iOS Safari.
 *
 * Chiến lược đa tầng:
 * 1. Web Audio API silent buffer loop (giữ audio subsystem active)
 * 2. Page Visibility API handler → resume AudioContext khi quay lại
 * 3. WakeLock API (Android) → ngăn màn hình tắt làm mất audio (khi hỗ trợ)
 * 4. Heartbeat ping qua Service Worker message để giữ SW alive
 * 5. MediaSession action handlers đầy đủ để OS routing audio đúng cách
 */

let silentAudioCtx: AudioContext | null = null;
let silentSource: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;
let isRunning = false;

// WakeLock sentinel (Android Chrome 84+, Edge 97+)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakeLockSentinel: any = null;

// Visibility change handler reference để cleanup đúng cách
let visibilityHandler: (() => void) | null = null;
let swHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Tạo hoặc resume AudioContext với silent buffer loop.
 * Android Chrome sẽ suspend AudioContext khi tab vào background.
 * Ta cần resume ngay khi tab active trở lại.
 */
function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!silentAudioCtx || silentAudioCtx.state === 'closed') {
      silentAudioCtx = new AudioContextClass();
    }

    // Resume nếu bị suspend (thường xảy ra sau khi app vào background trên Android)
    if (silentAudioCtx.state === 'suspended') {
      silentAudioCtx.resume().catch(() => {});
    }

    return silentAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Tạo silent buffer source loop - âm lượng 0 nhưng giữ audio pipeline active.
 * Đây là kỹ thuật chuẩn để giữ audio session trên iOS/Android.
 */
function createSilentLoop(ctx: AudioContext): void {
  if (silentSource) return; // đã tồn tại

  try {
    // Buffer 2 giây silent (stereo để đảm bảo tương thích tốt hơn)
    const buffer = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
    silentSource = ctx.createBufferSource();
    silentSource.buffer = buffer;
    silentSource.loop = true;

    gainNode = ctx.createGain();
    // Gain = 0.001 thay vì 0 để tránh một số browser optimization strip silent track
    gainNode.gain.setValueAtTime(0.001, ctx.currentTime);

    silentSource.connect(gainNode);
    gainNode.connect(ctx.destination);
    silentSource.start(0);
  } catch {
    silentSource = null;
    gainNode = null;
  }
}

/**
 * Dọn dẹp legacy audio anchor elements từ phiên bản cũ.
 */
function cleanupLegacyAnchors(): void {
  if (typeof document === 'undefined') return;
  ['wavelink-bg-audio-anchor', 'wavelink-mobile-bg-audio'].forEach((id) => {
    document.getElementById(id)?.remove();
  });
}

/**
 * Thử acquire Screen WakeLock để ngăn Android tắt màn hình và kill audio.
 * Chỉ hoạt động trên HTTPS + Android Chrome 84+ / Edge 97+.
 */
async function acquireWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (wakeLockSentinel) return; // đã có

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
      // Tự động reacquire nếu vẫn đang phát
      if (isRunning) {
        setTimeout(() => acquireWakeLock(), 1000);
      }
    });
  } catch {
    // WakeLock bị từ chối (không phải HTTPS, hoặc browser không hỗ trợ)
    wakeLockSentinel = null;
  }
}

/**
 * Release WakeLock khi không còn cần thiết.
 */
async function releaseWakeLock(): Promise<void> {
  if (!wakeLockSentinel) return;
  try {
    await wakeLockSentinel.release();
  } catch {}
  wakeLockSentinel = null;
}

/**
 * Gửi heartbeat ping đến Service Worker mỗi 25 giây.
 * Ngăn SW bị browser terminate khi không có activity.
 */
function startSwHeartbeat(): void {
  stopSwHeartbeat();
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  swHeartbeatTimer = setInterval(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        registration.active.postMessage({ type: 'AUDIO_KEEPALIVE', timestamp: Date.now() });
      }
    } catch {}
  }, 25000);
}

function stopSwHeartbeat(): void {
  if (swHeartbeatTimer) {
    clearInterval(swHeartbeatTimer);
    swHeartbeatTimer = null;
  }
}

/**
 * Đăng ký Page Visibility API handler.
 * Khi user quay lại app (sau khi chuyển app / bật màn hình), cần resume AudioContext
 * vì Android Chrome tự suspend nó khi document hidden.
 */
function registerVisibilityHandler(): void {
  if (typeof document === 'undefined') return;

  // Xóa handler cũ nếu có
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
  }

  visibilityHandler = () => {
    if (document.visibilityState === 'visible' && isRunning) {
      // Resume AudioContext ngay lập tức khi tab visible
      if (silentAudioCtx && silentAudioCtx.state === 'suspended') {
        silentAudioCtx.resume().catch(() => {});
      }
      // Reacquire WakeLock nếu đã bị release
      if (!wakeLockSentinel) {
        acquireWakeLock();
      }
    }
  };

  document.addEventListener('visibilitychange', visibilityHandler);
}

/**
 * Kích hoạt phiên phát âm thanh nền.
 * Gọi ngay khi bắt đầu phát audio.
 */
export function startBackgroundAudio(): void {
  if (typeof window === 'undefined') return;

  cleanupLegacyAnchors();

  const ctx = ensureAudioContext();
  if (ctx) {
    createSilentLoop(ctx);
  }

  registerVisibilityHandler();
  startSwHeartbeat();
  acquireWakeLock();

  isRunning = true;
}

/**
 * Dừng phiên phát âm thanh nền.
 * Gọi khi pause, close, hoặc sleep timer expired.
 */
export function stopBackgroundAudio(): void {
  isRunning = false;

  cleanupLegacyAnchors();
  stopSwHeartbeat();
  releaseWakeLock();

  // Cleanup visibility handler
  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }

  // Dừng silent source
  if (silentSource) {
    try {
      silentSource.stop();
      silentSource.disconnect();
    } catch {}
    silentSource = null;
  }

  if (gainNode) {
    try {
      gainNode.disconnect();
    } catch {}
    gainNode = null;
  }

  // Suspend AudioContext (không close để có thể reuse)
  if (silentAudioCtx && silentAudioCtx.state !== 'closed') {
    silentAudioCtx.suspend().catch(() => {});
  }
}

/**
 * Kiểm tra trạng thái đang chạy nền.
 */
export function isBackgroundAudioRunning(): boolean {
  return isRunning;
}

/**
 * Thủ công resume AudioContext (dùng khi detect user gesture trên iOS).
 * iOS Safari yêu cầu AudioContext phải được resume trong một user gesture event.
 */
export function resumeAudioContextOnGesture(): void {
  if (!silentAudioCtx) return;
  if (silentAudioCtx.state === 'suspended') {
    silentAudioCtx.resume().catch(() => {});
  }
}
