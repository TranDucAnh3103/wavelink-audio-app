import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { readSwrCache, writeSwrCache } from '@/lib/swrCache';
import { useIsHydrated } from '@/hooks/useDelayedFallback';
import { ListeningHistoryItem } from '@/types';

export function useRecentHistory() {
  const { user } = useAuthStore();
  const hydrated = useIsHydrated();
  const userKey = user?.id || 'guest';
  const cacheKey = `recent-history:${userKey}`;

  return useQuery({
    queryKey: ['recent-history', userKey],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.history.getRecentHistory(isLive);
      if (Array.isArray(data)) {
        writeSwrCache(cacheKey, data);
      }
      return data;
    },
    placeholderData: (prev) => {
      if (prev !== undefined) return prev;
      if (!hydrated) return undefined;
      return readSwrCache<ListeningHistoryItem[]>(cacheKey)?.data;
    },
  });
}
