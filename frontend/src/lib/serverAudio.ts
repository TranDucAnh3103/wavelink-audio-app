import { AudioItem, Category, SystemStats } from '@/types';
import { extractAudioIdFromSlug } from './slug';

const getBackendUrl = () => {
  if (process.env.BACKEND_INTERNAL_URL && process.env.BACKEND_INTERNAL_URL.trim().length > 0) {
    return process.env.BACKEND_INTERNAL_URL.trim().replace(/\/api\/v1\/?$/, '');
  }
  if (process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NEXT_PUBLIC_API_BASE_URL.trim().length > 0) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.trim().replace(/\/api\/v1\/?$/, '');
  }
  if (process.env.VITE_API_BASE_URL && process.env.VITE_API_BASE_URL.trim().length > 0) {
    return process.env.VITE_API_BASE_URL.trim().replace(/\/api\/v1\/?$/, '');
  }
  // Môi trường Vercel Cloud: Luôn dùng Render Backend Preview
  if (process.env.VERCEL) {
    return 'https://wavelink-audio-app-backend-latest.onrender.com';
  }
  return 'http://localhost:8080';
};

async function fetchJsonWithTimeout<T>(url: string, revalidateSeconds: number, timeoutMs = 2500): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: revalidateSeconds },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchServerAudio(id: string | number): Promise<AudioItem | null> {
  const resolvedId = extractAudioIdFromSlug(String(id));
  if (!resolvedId) return null;
  const backendUrl = getBackendUrl();
  const data = await fetchJsonWithTimeout<{ success?: boolean; data?: AudioItem }>(
    `${backendUrl}/api/v1/audios/${resolvedId}`,
    60,
    3500
  );
  if (data?.success && data.data) {
    return data.data;
  }
  return null;
}

export async function fetchServerAllAudios(): Promise<AudioItem[]> {
  const backendUrl = getBackendUrl();
  const data = await fetchJsonWithTimeout<{ success?: boolean; data?: AudioItem[] }>(
    `${backendUrl}/api/v1/audios?fields=catalog&all=true&limit=0`,
    300,
    3500
  );
  if (data?.success && Array.isArray(data.data)) {
    return data.data;
  }
  return [];
}

export interface ServerHomeData {
  audios: AudioItem[];
  catalogAudios: AudioItem[];
  categories: Category[];
  stats: SystemStats | null;
}

export async function fetchServerHomeData(): Promise<ServerHomeData> {
  const backendUrl = getBackendUrl();
  const [audiosRes, catalogRes, categoriesRes, statsRes] = await Promise.all([
    fetchJsonWithTimeout<{ success?: boolean; data?: AudioItem[] }>(
      `${backendUrl}/api/v1/audios?fields=lite&page=1&limit=36`,
      60,
      2500
    ),
    fetchJsonWithTimeout<{ success?: boolean; data?: AudioItem[] }>(
      `${backendUrl}/api/v1/audios?fields=catalog&all=true&limit=0`,
      60,
      2500
    ),
    fetchJsonWithTimeout<{ success?: boolean; data?: Category[] }>(
      `${backendUrl}/api/v1/categories`,
      300,
      2500
    ),
    fetchJsonWithTimeout<{ success?: boolean; data?: SystemStats }>(
      `${backendUrl}/api/v1/stats`,
      60,
      2500
    ),
  ]);

  return {
    audios: audiosRes?.success && Array.isArray(audiosRes.data) ? audiosRes.data : [],
    catalogAudios: catalogRes?.success && Array.isArray(catalogRes.data) ? catalogRes.data : [],
    categories: categoriesRes?.success && Array.isArray(categoriesRes.data) ? categoriesRes.data : [],
    stats: statsRes?.success && statsRes.data ? statsRes.data : null,
  };
}
