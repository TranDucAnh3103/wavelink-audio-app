import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { ListeningHistoryItem } from '@/types';

export function useRecentHistory() {
  const { user } = useAuthStore();
  const userKey = user?.id || 'guest';

  return useQuery({
    queryKey: ['recent-history', userKey],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.history.getRecentHistory(isLive);
      return data;
    },
  });
}
