/**
 * mediaSessionWorker.ts
 * Quản lý bộ đếm thời gian Web Worker giữ MediaSession và Audio Timeline hoạt động liên tục.
 * Khác với setInterval trên main thread (bị Android Chrome bóp nghẹt xuống 1-2 lần/phút khi chạy nền),
 * Web Worker gửi tick đều đặn để đồng bộ trạng thái MediaSession, duy trì quyền ưu tiên phát âm thanh nền
 * và ngăn hệ điều hành Android ngắt kết nối Audio Session.
 */

let workerInstance: Worker | null = null;
let fallbackInterval: ReturnType<typeof setInterval> | null = null;

export function startMediaSessionKeeper(onTick: () => void): void {
  stopMediaSessionKeeper();

  if (typeof window === 'undefined') return;

  // Khởi tạo Web Worker từ inline Blob để tránh mọi vấn đề về đường dẫn bundling
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const code = `
        let timer = setInterval(function() {
          postMessage('MEDIA_SESSION_TICK');
        }, 15000);
      `;
      const blob = new Blob([code], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      workerInstance = new Worker(workerUrl);

      workerInstance.onmessage = (event) => {
        if (event.data === 'MEDIA_SESSION_TICK') {
          onTick();
        }
      };

      workerInstance.onerror = () => {
        stopMediaSessionKeeper();
        startFallbackInterval(onTick);
      };

      return;
    } catch {
      // Fallback nếu môi trường chặn Worker
    }
  }

  startFallbackInterval(onTick);
}

function startFallbackInterval(onTick: () => void): void {
  fallbackInterval = setInterval(() => {
    onTick();
  }, 15000);
}

export function stopMediaSessionKeeper(): void {
  if (workerInstance) {
    try {
      workerInstance.terminate();
    } catch {}
    workerInstance = null;
  }
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
}
