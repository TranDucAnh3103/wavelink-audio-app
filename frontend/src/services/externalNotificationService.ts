import { notificationService } from './notificationService';
import { audioService } from './audioService';
import { playNotificationSound } from '@/lib/soundEffects';
import { buildPlayerPath } from '@/lib/slug';
import type { NotificationItem } from '@/types';

export function normalizeNotificationPath(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '/notifications';
  let target = rawUrl.trim();
  if (target.startsWith('/#/')) target = target.slice(2);
  else if (target.startsWith('#/')) target = target.slice(1);
  const legacyMatch = target.match(/^\/player\?(?:audioId|id)=(\d+)/i);
  if (legacyMatch) return `/player/${legacyMatch[1]}`;
  return target || '/notifications';
}

class ExternalNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private isWatcherStarted = false;
  private watcherIntervalId: number | null = null;

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  }

  getPermission(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (err) {
      console.warn('requestPermission error:', err);
      return false;
    }
  }

  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.swRegistration = reg;
      return reg;
    } catch (err) {
      console.warn('Đăng ký Service Worker thất bại:', err);
      return null;
    }
  }

  async showSystemNotification(
    title: string,
    options: {
      body?: string;
      url?: string;
      tag?: string;
      type?: 'audio' | 'system' | 'vip';
    } = {}
  ): Promise<boolean> {
    if (!this.isSupported()) return false;

    const prefs = notificationService.getLocalPreferences();
    if (prefs.blockAll) return false;
    if (options.type === 'audio' && prefs.externalAudio === false) return false;
    if (this.getPermission() !== 'granted') return false;

    // Anti-spam: tối thiểu 15s giữa 2 thông báo, không lặp cùng tag trong 3 phút
    const now = Date.now();
    const spamTag = options.tag || title;
    const itemKey = `wavelink_notif_tag_${spamTag}`;

    try {
      const lastOverall = Number(localStorage.getItem('wavelink_last_sys_notif_time') || 0);
      const lastTag = Number(localStorage.getItem(itemKey) || 0);
      if (now - lastOverall < 15000) return false;
      if (now - lastTag < 180000) return false;
      localStorage.setItem('wavelink_last_sys_notif_time', String(now));
      localStorage.setItem(itemKey, String(now));
    } catch {}

    const payload = {
      body: options.body || '',
      icon: '/wavelink-icon.png',
      badge: '/wavelink-icon.png',
      tag: options.tag || 'wavelink-global-notice',
      data: { url: normalizeNotificationPath(options.url || '/notifications') },
      renotify: false,
    };

    playNotificationSound();

    try {
      if ('serviceWorker' in navigator) {
        const reg = this.swRegistration || (await navigator.serviceWorker.ready);
        if (reg && reg.showNotification) {
          await reg.showNotification(title, payload);
          return true;
        }
      }
      new Notification(title, payload);
      return true;
    } catch (e) {
      console.warn('Lỗi hiển thị Notification:', e);
      return false;
    }
  }

  /** Hiển thị thông báo hệ thống cho tin nhắn realtime nhận từ WebSocket khi tab đang chạy nền. */
  async notifyFromServerItem(item: NotificationItem): Promise<boolean> {
    if (typeof document !== 'undefined' && !document.hidden) {
      return false;
    }
    const kind: 'audio' | 'vip' | 'system' =
      item.type === 'NEW_EPISODE' || item.type === 'AUDIO' || item.type === 'NOVEL_UPDATE'
        ? 'audio'
        : item.type === 'VIP' || item.type === 'MEMBERSHIP' || item.type === 'PROMOTION'
          ? 'vip'
          : 'system';

    return this.showSystemNotification(item.title, {
      body: item.message,
      url: normalizeNotificationPath(item.link),
      tag: `wavelink-srv-${item.id}`,
      type: kind,
    });
  }

  initBackgroundWatcher() {
    if (typeof window === 'undefined' || this.isWatcherStarted) return;
    this.isWatcherStarted = true;

    this.registerServiceWorker();

    const checkNewAudio = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return;
        }
        const prefs = notificationService.getLocalPreferences();
        if (prefs.blockAll || prefs.externalAudio === false) {
          return;
        }
        if (this.getPermission() !== 'granted') {
          return;
        }

        const audios = await audioService.getAudios({ page: 1, limit: 1, sort: 'latest' });
        const latestAudio = audios?.[0];
        if (!latestAudio) return;

        const lastNotifiedAudioId = localStorage.getItem('wavelink_last_audio_notified_id');
        const currentAudioId = String(latestAudio.id);

        if (!lastNotifiedAudioId) {
          localStorage.setItem('wavelink_last_audio_notified_id', currentAudioId);
          return;
        }

        if (lastNotifiedAudioId !== currentAudioId) {
          await this.showSystemNotification(`WaveLink • Audio Mới 🎧`, {
            body: `"${latestAudio.title}" vừa được thêm vào thư viện. Bấm để nghe ngay!`,
            url: buildPlayerPath(latestAudio),
            tag: `wavelink-new-audio-${latestAudio.id}`,
            type: 'audio',
          });
          localStorage.setItem('wavelink_last_audio_notified_id', currentAudioId);
        }
      } catch {
        // Silent fail in background
      }
    };

    setTimeout(checkNewAudio, 20000);
    this.watcherIntervalId = window.setInterval(checkNewAudio, 300000);
  }

  destroy() {
    if (this.watcherIntervalId) {
      clearInterval(this.watcherIntervalId);
      this.watcherIntervalId = null;
    }
    this.isWatcherStarted = false;
  }
}

export const externalNotificationService = new ExternalNotificationService();
