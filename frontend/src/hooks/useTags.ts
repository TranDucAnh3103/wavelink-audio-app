import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { CreateTagPayload, Tag } from '@/types';
import { useAuthStore } from '@/stores/authStore';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.tag.getTags(isLive);
      return data;
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

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number | string; data: Partial<Tag> }) => {
      const { isLive } = useAuthStore.getState();
      return api.tag.updateTag(id, data, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useMergeTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceIds, targetId }: { sourceIds: number[]; targetId: number }) =>
      api.tag.mergeTags(sourceIds, targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
    },
  });
}

export function useCleanupUnusedTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.tag.cleanupUnusedTags(),
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
