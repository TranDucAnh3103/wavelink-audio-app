import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Category, CreateCategoryPayload } from '@/types';
import { useAuthStore } from '@/stores/authStore';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { isLive } = useAuthStore.getState();
      const data = await api.category.getCategories(isLive);
      return data;
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
    },
  });
}
