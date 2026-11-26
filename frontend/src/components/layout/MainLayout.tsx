import React, { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { SidebarNav } from './SidebarNav';
import { MiniPlayer } from './MiniPlayer';
import { AudioEngineHost } from './AudioEngineHost';
import { ScreenLockOverlay } from './ScreenLockOverlay';
import { LoadingState } from '@/components/common/LoadingState';
import { ToastContainer } from '@/components/ui/Toast';
import { usePlayerStore } from '@/stores/playerStore';
import { useShallow } from 'zustand/react/shallow';
import { peekLibraryReturnState } from '@/lib/libraryNavigationState';

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const { isScreenLocked, setScreenLocked, hasCurrentAudio } = usePlayerStore(
    useShallow((s) => ({
      isScreenLocked: s.isScreenLocked,
      setScreenLocked: s.setScreenLocked,
      hasCurrentAudio: Boolean(s.currentAudio),
    }))
  );

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

      {!isAuthPage && <MiniPlayer />}
      {!isAuthPage && <Footer />}

      {isScreenLocked && hasCurrentAudio && (
        <ScreenLockOverlay onClose={() => setScreenLocked(false)} />
      )}

      <AudioEngineHost />
      <ToastContainer />
    </div>
  );
};
