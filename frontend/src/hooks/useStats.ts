import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { SystemStats } from '@/types';

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.stats.getStats(isLive);
      return data;
    },
  });
}
