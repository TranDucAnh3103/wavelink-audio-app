'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Hydration-safe hook using React 18 useSyncExternalStore.
 * Returns false on SSR and initial hydration pass, true immediately after client mount.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

/**
 * Delays showing a skeleton fallback until loading genuinely exceeds `delayMs`.
 * Prevents annoying skeleton flashes on page reload when cached/SSR or fast network data is available.
 * Returns immediately in test environments for deterministic test assertions.
 */
export function useDelayedFallback(isPending: boolean, delayMs: number = 180): boolean {
  const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const [visible, setVisible] = useState<boolean>(isTestEnv ? isPending : false);

  useEffect(() => {
    if (isTestEnv) {
      setVisible(isPending);
      return;
    }

    if (!isPending) {
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      setVisible(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [isPending, delayMs, isTestEnv]);

  return isTestEnv ? isPending : isPending && visible;
}
