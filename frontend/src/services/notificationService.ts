import { axiosClient } from '@/lib/axiosClient';
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

  async getNotifications(isLive = true): Promise<NotificationItem[]> {
    if (isLive) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(LOCAL_STORAGE_NOTIFS_KEY);
        }
        const res = await axiosClient.get<{ success: boolean; data: NotificationItem[] }>('/notifications');
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
};
