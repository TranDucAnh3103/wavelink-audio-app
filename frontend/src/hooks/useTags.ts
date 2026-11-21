import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { CreateTagPayload, Tag } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { readSwrCache, writeSwrCache } from '@/lib/swrCache';
import { useIsHydrated } from '@/hooks/useDelayedFallback';

export function useTags() {
  const hydrated = useIsHydrated();
  return useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.tag.getTags(isLive);
      if (Array.isArray(data) && data.length > 0) {
        writeSwrCache('tags', data);
      }
      return data;
    },
    placeholderData: (prev) => {
      if (prev !== undefined) return prev;
      if (!hydrated) return undefined;
      return readSwrCache<Tag[]>('tags')?.data;
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateTagPayload) => {
      const { isLive } = useAuthStore.getState();
      return api.tag.createTag(payload, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number | string) => {
      const { isLive } = useAuthStore.getState();
      return api.tag.deleteTag(id, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}
