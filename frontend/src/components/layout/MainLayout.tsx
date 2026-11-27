import React, { Suspense, lazy, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { SidebarNav } from './SidebarNav';
import { AudioEngineHost } from './AudioEngineHost';
import { LoadingState } from '@/components/common/LoadingState';

const MiniPlayer = lazy(() =>
  import('./MiniPlayer').then((m) => ({ default: m.MiniPlayer }))
);
const ScreenLockOverlay = lazy(() =>
  import('./ScreenLockOverlay').then((m) => ({ default: m.ScreenLockOverlay }))
);
import { ToastContainer } from '@/components/ui/Toast';
import { usePlayerStore } from '@/stores/playerStore';
import { useShallow } from 'zustand/react/shallow';
import { peekLibraryReturnState } from '@/lib/libraryNavigationState';

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const { isScreenLocked, setScreenLocked, hasCurrentAudio, hydrateLastPlaybackSession } =
    usePlayerStore(
      useShallow((s) => ({
        isScreenLocked: s.isScreenLocked,
        setScreenLocked: s.setScreenLocked,
        hasCurrentAudio: Boolean(s.currentAudio),
        hydrateLastPlaybackSession: s.hydrateLastPlaybackSession,
      }))
    );

  useEffect(() => {
    hydrateLastPlaybackSession();
  }, [hydrateLastPlaybackSession]);

  useEffect(() => {
    if (location.pathname === '/library' && peekLibraryReturnState()) {
      return;
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo(0, 0);
      } catch {}
    }
  }, [location.pathname, location.search]);

  return (
    <div className="app-shell">
      {!isAuthPage && <SidebarNav />}
      {!isAuthPage && <Header />}

      <main
        id="app-main"
        className={`flex-1 flex flex-col relative w-full ${
          isAuthPage
            ? 'pt-4 md:pt-8 justify-center'
            : 'pt-16 md:pt-20 md:pl-[76px] lg:pl-60'
        }`}
      >
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>

      {!isAuthPage && hasCurrentAudio && (
        <Suspense fallback={null}>
          <MiniPlayer />
        </Suspense>
      )}
      {!isAuthPage && <Footer />}

      {isScreenLocked && hasCurrentAudio && (
        <Suspense fallback={null}>
          <ScreenLockOverlay onClose={() => setScreenLocked(false)} />
        </Suspense>
      )}

      <AudioEngineHost />
      <ToastContainer />
    </div>
  );
};
