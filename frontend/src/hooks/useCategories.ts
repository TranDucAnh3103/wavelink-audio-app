import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Category, CreateCategoryPayload } from '@/types';
import { useAuthStore } from '@/stores/authStore';

export function useCategories(
  includeHidden = false,
  options?: { initialData?: Category[] }
) {
  const initialData =
    options?.initialData && options.initialData.length > 0 ? options.initialData : undefined;

  return useQuery({
    queryKey: ['categories', includeHidden ? 'admin' : 'public'],
    initialData,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.category.getCategories(isLive, includeHidden);
      return data;
    },
  });
}

export function useMergeCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      api.category.mergeCategories(sourceId, targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCategoryPayload) => {
      const { isLive } = useAuthStore.getState();
      return api.category.createCategory(payload, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number | string; data: Partial<Category> }) => {
      const { isLive } = useAuthStore.getState();
      return api.category.updateCategory(id, data, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number | string) => {
      const { isLive } = useAuthStore.getState();
      return api.category.deleteCategory(id, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
    },
  });
}
