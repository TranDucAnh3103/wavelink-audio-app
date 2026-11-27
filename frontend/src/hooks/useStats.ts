import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { SystemStats } from '@/types';

export function useStats(options?: { initialData?: SystemStats | null }) {
  return useQuery({
    queryKey: ['stats'],
    initialData: options?.initialData ?? undefined,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.stats.getStats(isLive);
      return data;
    },
  });
}
