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
    externalNotificationService.initBackgroundWatcher();
    const cleanupBridge = initMobileBridge();
    return () => {
      cleanupBridge();
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
