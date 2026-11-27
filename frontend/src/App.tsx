import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AppRoutes } from '@/router';
import { externalNotificationService } from '@/services/externalNotificationService';
import { primeAudioContextOnFirstGesture } from '@/lib/backgroundAudioKeeper';
import { initMobileBridge } from '@/lib/mobileBridge';

export const App: React.FC = () => {
  const { initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
    primeAudioContextOnFirstGesture();
    const cleanup = initMobileBridge();

    let idleHandle: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const startWatcher = () => {
      externalNotificationService.initBackgroundWatcher();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleHandle = (
        window as Window & {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(startWatcher, { timeout: 2500 });
    } else {
      fallbackTimer = setTimeout(startWatcher, 1500);
    }

    return () => {
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          idleHandle
        );
      }
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
      }
      cleanup();
    };
  }, [initAuth]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
