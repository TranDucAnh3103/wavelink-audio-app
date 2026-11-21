import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { readSwrCache, writeSwrCache } from '@/lib/swrCache';
import { useIsHydrated } from '@/hooks/useDelayedFallback';
import { SystemStats } from '@/types';

export function useStats() {
  const hydrated = useIsHydrated();
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.stats.getStats(isLive);
      if (data) {
        writeSwrCache('stats', data);
      }
      return data;
    },
    placeholderData: (prev) => {
      if (prev !== undefined) return prev;
      if (!hydrated) return undefined;
      return readSwrCache<SystemStats>('stats')?.data;
    },
  });
}
