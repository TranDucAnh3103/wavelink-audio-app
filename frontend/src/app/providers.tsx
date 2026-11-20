'use client';

import React, { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { externalNotificationService } from '@/services/externalNotificationService';
import { primeAudioContextOnFirstGesture } from '@/lib/backgroundAudioKeeper';
import { initMobileBridge } from '@/lib/mobileBridge';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const { initAuth } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    initAuth();
    primeAudioContextOnFirstGesture();
    externalNotificationService.initBackgroundWatcher();
    const cleanup = initMobileBridge();
    return () => {
      cleanup();
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
