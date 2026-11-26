import { axiosClient, API_BASE } from '@/lib/axiosClient';
import { NotificationItem, NotificationPreferences } from '@/types';

const LOCAL_STORAGE_NOTIFS_KEY = 'wavelink_local_notifications';
const LOCAL_STORAGE_PREFS_KEY = 'wavelink_notification_prefs';

export const notificationService = {
  getLocalPreferences(): NotificationPreferences {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_PREFS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return {
      notifyNewEpisodes: true,
      notifyMembership: true,
      notifySystem: true,
      externalAudio: true,
      blockAll: false,
    };
  },

  saveLocalPreferences(prefs: NotificationPreferences) {
    try {
      localStorage.setItem(LOCAL_STORAGE_PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  },

  async getNotifications(
    isLive = true,
    opts?: { filter?: string; type?: string }
  ): Promise<NotificationItem[]> {
    if (isLive) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(LOCAL_STORAGE_NOTIFS_KEY);
        }
        const params: Record<string, string> = {};
        if (opts?.filter && opts.filter !== 'all') params.filter = opts.filter;
        if (opts?.type && opts.type !== 'ALL') params.type = opts.type;
        const res = await axiosClient.get<{ success: boolean; data: NotificationItem[] }>('/notifications', {
          params: Object.keys(params).length ? params : undefined,
        });
        if (res.data.success && Array.isArray(res.data.data)) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('getNotifications failed:', err);
      }
      return [];
    }
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  },

  async getUnreadCount(isLive = true): Promise<number> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: { count?: number; unreadCount?: number } }>('/notifications/unread-count');
        if (res.data.success && res.data.data) {
          return res.data.data.unreadCount ?? res.data.data.count ?? 0;
        }
      } catch (err) {
        console.warn('getUnreadCount failed:', err);
      }
    }
    const notifs = await this.getNotifications(false);
    return notifs.filter((n) => !n.isRead).length;
  },

  async markAsRead(id: number | string, isLive = true): Promise<boolean> {
    let success = false;
    if (isLive) {
      try {
        const res = await axiosClient.put<{ success: boolean }>(`/notifications/${id}/read`);
        success = Boolean(res.data.success);
      } catch {
        success = false;
      }
    }
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY);
      if (stored) {
        const list: NotificationItem[] = JSON.parse(stored);
        const updated = list.map((n) => (String(n.id) === String(id) ? { ...n, isRead: true } : n));
        localStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, JSON.stringify(updated));
      }
    } catch {}
    return success;
  },

  async markAllAsRead(isLive = true): Promise<boolean> {
    let success = false;
    if (isLive) {
      try {
        const res = await axiosClient.put<{ success: boolean }>('/notifications/read-all');
        success = Boolean(res.data.success);
      } catch {
        success = false;
      }
    }
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY);
      if (stored) {
        const list: NotificationItem[] = JSON.parse(stored);
        const updated = list.map((n) => ({ ...n, isRead: true }));
        localStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, JSON.stringify(updated));
      }
    } catch {}
    return success;
  },

  async deleteNotification(id: number | string, isLive = true): Promise<boolean> {
    let success = false;
    if (isLive) {
      try {
        const res = await axiosClient.delete<{ success: boolean }>(`/notifications/${id}`);
        success = Boolean(res.data.success);
      } catch {
        success = false;
      }
    }
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY);
      if (stored) {
        const list: NotificationItem[] = JSON.parse(stored);
        const updated = list.filter((n) => String(n.id) !== String(id));
        localStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, JSON.stringify(updated));
      }
    } catch {}
    return success || !isLive;
  },

  async deleteAllNotifications(isLive = true): Promise<boolean> {
    let success = false;
    if (isLive) {
      try {
        const res = await axiosClient.delete<{ success: boolean }>('/notifications');
        success = Boolean(res.data.success);
      } catch {
        success = false;
      }
    }
    try {
      localStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, JSON.stringify([]));
    } catch {}
    return success || !isLive;
  },

  async getPreferences(isLive = true): Promise<NotificationPreferences> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: any }>(
          '/notifications/preferences'
        );
        if (res.data.success && res.data.data) {
          const d = res.data.data;
          const merged: NotificationPreferences = {
            notifyNewEpisodes: d.notifyNewEpisodes ?? d.novelUpdates ?? true,
            notifyMembership: d.notifyMembership ?? d.promotionAlerts ?? true,
            notifySystem: d.notifySystem ?? d.systemAlerts ?? true,
            externalAudio: d.externalAudio ?? true,
            blockAll: d.blockAll ?? false,
          };
          this.saveLocalPreferences(merged);
          return merged;
        }
      } catch {}
    }
    return this.getLocalPreferences();
  },

  async updatePreferences(prefs: NotificationPreferences, isLive = true): Promise<boolean> {
    this.saveLocalPreferences(prefs);
    if (isLive) {
      try {
        const payload = {
          notifyNewEpisodes: prefs.notifyNewEpisodes,
          notifyMembership: prefs.notifyMembership,
          notifySystem: prefs.notifySystem,
          novelUpdates: prefs.notifyNewEpisodes,
          promotionAlerts: prefs.notifyMembership,
          systemAlerts: prefs.notifySystem,
          externalAudio: prefs.externalAudio ?? true,
          blockAll: prefs.blockAll ?? false,
        };
        const res = await axiosClient.put<{ success: boolean }>('/notifications/preferences', payload);
        return Boolean(res.data.success);
      } catch {
        return false;
      }
    }
    return true;
  },

  connectWebSocket(onNotification: (item: NotificationItem) => void): () => void {
    if (typeof window === 'undefined' || !window.WebSocket) {
      return () => {};
    }
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) return () => {};

    let socket: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const connect = () => {
      try {
        let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let host = window.location.host;
        if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
          try {
            const parsed = new URL(API_BASE);
            host = parsed.host;
            protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          } catch {}
        } else if (API_BASE.includes('8080') || host.includes('5173') || host.includes('3000')) {
          host = window.location.hostname + ':8080';
        }

        const wsUrl = `${protocol}//${host}/api/v1/notifications/ws?token=${encodeURIComponent(token)}`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          pingInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };

        socket.onmessage = (event) => {
          const raw = typeof event.data === 'string' ? event.data : '';
          for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try {
              const pkt = JSON.parse(line) as { type?: string; data?: NotificationItem };
              if (pkt.type === 'notification' && pkt.data) {
                onNotification(pkt.data);
              }
            } catch {}
          }
        };

        socket.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          if (!closed) {
            setTimeout(() => !closed && connect(), 5000);
          }
        };

        socket.onerror = () => {
          socket?.close();
        };
      } catch {}
    };

    connect();

    return () => {
      closed = true;
      if (pingInterval) clearInterval(pingInterval);
      socket?.close();
    };
  },
};
