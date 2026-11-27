import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { AudioFilter, AudioItem, Episode, ImportYouTubePayload } from '@/types';
import { useAuthStore } from '@/stores/authStore';

export function useAudios(
  filter: AudioFilter = {},
  options?: { enabled?: boolean; initialData?: AudioItem[]; staleTime?: number }
) {
  const { user } = useAuthStore();
  const initialData =
    options?.initialData && options.initialData.length > 0 ? options.initialData : undefined;

  return useQuery({
    queryKey: ['audios', filter, user?.id || 0],
    enabled: options?.enabled ?? true,
    initialData,
    staleTime: options?.staleTime ?? (filter.fields === 'catalog' ? 5 * 60 * 1000 : undefined),
    queryFn: async () => {
      const { isLive, user: latestUser } = useAuthStore.getState();
      const data = await api.audio.getAudios(filter, isLive, latestUser?.id);
      return data;
    },
  });
}

export function useAudio(id: number | string | undefined, initialAudio?: AudioItem | null) {

  return useQuery({
    queryKey: ['audio', id],
    queryFn: async () => {
      if (!id) return null;
      const { isLive } = useAuthStore.getState();
      const data = await api.audio.getAudioById(id, isLive);
      return data;
    },
    enabled: Boolean(id),
    initialData: initialAudio ?? undefined,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } } | null)?.response?.status;
      if (status === 404 || status === 403) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });
}

export function useAudioEpisodes(audioId: number | string | undefined) {

  return useQuery({
    queryKey: ['episodes', audioId],
    queryFn: async () => {
      if (!audioId) return [];
      const { isLive } = useAuthStore.getState();
      const data = await api.episode.getEpisodes(audioId, isLive);
      return data;
    },
    enabled: Boolean(audioId),
  });
}

export function useImportQuota() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['import-quota', user?.id, user?.role, user?.membership],
    queryFn: () => {
      const { isLive, user: latestUser } = useAuthStore.getState();
      return api.audio.getImportQuota(isLive, latestUser);
    },
  });
}

export function useImportYouTube() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ImportYouTubePayload) => {
      const { isLive, user } = useAuthStore.getState();
      return api.audio.importYouTube(payload, isLive, user?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['import-quota'] });
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (audioId: number | string) => {
      const { isLive } = useAuthStore.getState();
      return api.audio.toggleFavorite(audioId, isLive);
    },
    onMutate: async (audioId) => {
      await queryClient.cancelQueries({ queryKey: ['audio'] });
      await queryClient.cancelQueries({ queryKey: ['audios'] });

      queryClient.setQueriesData({ queryKey: ['audio'] }, (old: any) => {
        if (!old) return old;
        if (String(old.id) === String(audioId)) {
          return { ...old, isFavorite: !old.isFavorite };
        }
        return old;
      });

      queryClient.setQueriesData({ queryKey: ['audios'] }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((a) => (String(a.id) === String(audioId) ? { ...a, isFavorite: !a.isFavorite } : a));
        }
        if (old.data && Array.isArray(old.data)) {
          return {
            ...old,
            data: old.data.map((a: any) =>
              String(a.id) === String(audioId) ? { ...a, isFavorite: !a.isFavorite } : a
            ),
          };
        }
        return old;
      });
    },
    onSuccess: (newStatus, audioId) => {
      if (typeof newStatus === 'boolean') {
        queryClient.setQueriesData({ queryKey: ['audio'] }, (old: any) => {
          if (old && String(old.id) === String(audioId)) {
            return { ...old, isFavorite: newStatus };
          }
          return old;
        });
      }
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      queryClient.invalidateQueries({ queryKey: ['audio'] });
    },
  });
}

export function useUpdateAudio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number | string; data: Partial<AudioItem> }) => {
      const { isLive } = useAuthStore.getState();
      return api.audio.updateAudio(id, data, isLive);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      queryClient.invalidateQueries({ queryKey: ['audio', id] });
    },
  });
}

export function useDeleteAudio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number | string) => {
      const { isLive } = useAuthStore.getState();
      return api.audio.deleteAudio(id, isLive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
