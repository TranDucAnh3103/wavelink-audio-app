'use client';

const SWR_PREFIX = 'wavelink_cache_swr:';
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const trackedKeys = new Set<string>();

interface SwrCacheEntry<T> {
  data: T;
  updatedAt: number;
}

function isCacheDisabled(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return true;
  }
  return false;
}

export function readSwrCache<T>(
  key: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): { data: T; updatedAt: number } | undefined {
  if (isCacheDisabled()) return undefined;
  try {
    const raw = localStorage.getItem(`${SWR_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SwrCacheEntry<T>;
    if (!parsed || typeof parsed.updatedAt !== 'number') return undefined;
    if (Date.now() - parsed.updatedAt > maxAgeMs) {
      localStorage.removeItem(`${SWR_PREFIX}${key}`);
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeSwrCache<T>(key: string, data: T): void {
  if (isCacheDisabled()) return;
  try {
    const storageKey = `${SWR_PREFIX}${key}`;
    const payload: SwrCacheEntry<T> = {
      data,
      updatedAt: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    trackedKeys.add(storageKey);
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function clearSwrCache(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove = new Set<string>(trackedKeys);
    if (typeof localStorage.length === 'number' && typeof localStorage.key === 'function') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(SWR_PREFIX)) {
          keysToRemove.add(k);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    trackedKeys.clear();
  } catch {
    // Ignore
  }
}
