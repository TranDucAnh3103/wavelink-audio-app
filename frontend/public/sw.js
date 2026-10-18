/**
 * WaveLink Service Worker v2.0
 * - Xử lý thông báo ngoài ứng dụng khi ứng dụng đóng hoặc chạy nền
 * - Audio keepalive: nhận heartbeat ping từ app để giữ SW alive khi background
 * - Cache API assets để app load nhanh hơn khi mạng chậm
 */

const CACHE_NAME = 'wavelink-v2';
const AUDIO_KEEPALIVE_CHANNEL = 'wavelink-audio-keepalive';

// ─── Install & Activate ────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Xóa cache cũ
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

// ─── Fetch: Network-first với cache fallback cho static assets ─────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Chỉ cache GET requests của cùng origin (không cache YouTube API calls)
  if (request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin)) return;

  // Bỏ qua API calls (không cache dynamic data)
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const networkResponse = await fetch(request);
        // Chỉ cache successful responses
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        // Offline fallback: trả về từ cache
        const cached = await cache.match(request);
        if (cached) return cached;
        // Nếu không có cache, throw để browser xử lý
        throw new Error('Network error and no cache available');
      }
    })
  );
});

// ─── Message Handler ────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (!event.data) return;

  // Hiển thị thông báo OS từ app
  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        icon: '/wavelink-icon.png',
        badge: '/wavelink-icon.png',
        tag: 'wavelink-notification',
        renotify: false,
        ...options,
      })
    );
    return;
  }

  // Audio keepalive heartbeat từ backgroundAudioKeeper
  // SW phản hồi lại để confirm vẫn active, giúp Android biết có audio session đang chạy
  if (event.data.type === 'AUDIO_KEEPALIVE') {
    // Phản hồi về client để xác nhận SW vẫn alive
    event.source?.postMessage({
      type: 'AUDIO_KEEPALIVE_ACK',
      timestamp: Date.now(),
    });
    return;
  }

  // Lệnh skip waiting (force update SW)
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
});

// ─── Notification Click ────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/#/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Nếu đã có cửa sổ WaveLink đang mở, focus và điều hướng
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Nếu chưa có cửa sổ nào đang mở, mở tab mới
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── Web Push ──────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let payload = {
    title: 'WaveLink - Thông Báo Mới 🎧',
    body: 'Có nội dung và tập truyện mới trên WaveLink!',
    url: '/#/notifications',
    tag: 'wavelink-push-notification',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/wavelink-icon.png',
      badge: '/wavelink-icon.png',
      tag: payload.tag,
      data: { url: payload.url },
      renotify: false,
    })
  );
});
