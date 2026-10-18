import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AppRoutes } from '@/router';
import { externalNotificationService } from '@/services/externalNotificationService';
import { primeAudioContextOnFirstGesture } from '@/lib/backgroundAudioKeeper';

export const App: React.FC = () => {
  const { initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
    primeAudioContextOnFirstGesture();
    externalNotificationService.initBackgroundWatcher();
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
