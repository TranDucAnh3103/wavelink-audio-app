import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { NotificationItem, NotificationPreferences } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { playNotificationSound } from '@/lib/soundEffects';

const LAST_KNOWN_UNREAD_KEY = 'wavelink_last_known_unread_count';

function getInitialKnownUnreadCount(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(LAST_KNOWN_UNREAD_KEY);
    return v !== null ? Number(v) : null;
  } catch {
    return null;
  }
}

let prevUnreadCount: number | null = getInitialKnownUnreadCount();
let isInitialFetch = true;
let lastChimeAt = 0;

function playChimeDeduped() {
  const now = Date.now();
  if (now - lastChimeAt < 1500) return;
  lastChimeAt = now;
  playNotificationSound();
}

export function triggerNotificationSync(playChime = true) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wavelink:notification:sync', { detail: { playChime } }));
  }
}

export function useNotifications() {
  const { user } = useAuthStore();
  const isMember = Boolean(user && !user.isGuest && user.role !== 'GUEST');

  return useQuery({
    queryKey: ['notifications', user?.id || 'guest'],
    enabled: isMember,
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.notification.getNotifications(isLive);
      return data;
    },
  });
}

export function useUnreadNotificationCount() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isMember = Boolean(user && !user.isGuest && user.role !== 'GUEST');

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ playChime?: boolean }>;
      if (customEvent.detail?.playChime) {
        playChimeDeduped();
      }
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    window.addEventListener('wavelink:notification:sync', handleSync);
    return () => window.removeEventListener('wavelink:notification:sync', handleSync);
  }, [queryClient]);

  return useQuery({
    queryKey: ['unread-notification-count', user?.id || 'guest'],
    enabled: isMember,
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const count = await api.notification.getUnreadCount(isLive);
      if (!isInitialFetch && prevUnreadCount !== null && count > prevUnreadCount) {
        playChimeDeduped();
      }
      isInitialFetch = false;
      prevUnreadCount = count;
      try {
        localStorage.setItem(LAST_KNOWN_UNREAD_KEY, String(count));
      } catch {}
      return count;
    },
    refetchInterval: isMember ? 8000 : false,
    refetchOnWindowFocus: isMember,
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number | string) => {
      const { isLive } = useAuthStore.getState();
      return api.notification.markAsRead(id, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      const { isLive } = useAuthStore.getState();
      return api.notification.markAllAsRead(isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number | string) => {
      const { isLive } = useAuthStore.getState();
      return api.notification.deleteNotification(id, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
    },
  });
}

export function useDeleteAllNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      const { isLive } = useAuthStore.getState();
      return api.notification.deleteAllNotifications(isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
    },
  });
}

export function useNotificationPreferences() {
  const { user } = useAuthStore();
  const isMember = Boolean(user && !user.isGuest && user.role !== 'GUEST');
  return useQuery({
    queryKey: ['notification-preferences', user?.id || 'guest'],
    enabled: isMember,
    queryFn: () => {
      const { isLive } = useAuthStore.getState();
      return api.notification.getPreferences(isLive);
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prefs: NotificationPreferences) => {
      const { isLive } = useAuthStore.getState();
      return api.notification.updatePreferences(prefs, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}
