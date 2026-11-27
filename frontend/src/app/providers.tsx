'use client';

import React, { useEffect, useLayoutEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { externalNotificationService } from '@/services/externalNotificationService';
import { primeAudioContextOnFirstGesture } from '@/lib/backgroundAudioKeeper';
import { initMobileBridge } from '@/lib/mobileBridge';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function AppProviders({ children }: { children: React.ReactNode }) {
  const { initAuth, hydrateFromCache } = useAuthStore();
  const { initTheme } = useThemeStore();

  useIsomorphicLayoutEffect(() => {
    hydrateFromCache();
    const cleanupTheme = initTheme();
    return () => {
      cleanupTheme();
    };
  }, [hydrateFromCache, initTheme]);

  useEffect(() => {
    initAuth();
    primeAudioContextOnFirstGesture();
    const cleanupBridge = initMobileBridge();

    let idleHandle: number | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const startWatcher = () => {
      externalNotificationService.initBackgroundWatcher();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleHandle = (window as unknown as {
        requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
      }).requestIdleCallback(startWatcher, { timeout: 2500 });
    } else {
      fallbackTimer = setTimeout(startWatcher, 1500);
    }

    return () => {
      cleanupBridge();
      if (
        idleHandle !== undefined &&
        typeof window !== 'undefined' &&
        'cancelIdleCallback' in window
      ) {
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleHandle
        );
      }
      if (fallbackTimer !== undefined) {
        clearTimeout(fallbackTimer);
      }
    };
  }, [initAuth]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
