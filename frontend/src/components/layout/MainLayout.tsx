import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { SidebarNav } from './SidebarNav';
import { MiniPlayer } from './MiniPlayer';
import { YouTubeEngineHost } from './YouTubeEngineHost';
import { ScreenLockOverlay } from './ScreenLockOverlay';
import { ToastContainer } from '@/components/ui/Toast';
import { usePlayerStore } from '@/stores/playerStore';

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const { isScreenLocked, setScreenLocked, currentAudio } = usePlayerStore();

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
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
        <Outlet />
      </main>

      {!isAuthPage && <MiniPlayer />}
      {!isAuthPage && <Footer />}

      {isScreenLocked && currentAudio && (
        <ScreenLockOverlay onClose={() => setScreenLocked(false)} />
      )}

      <YouTubeEngineHost />
      <ToastContainer />
    </div>
  );
};
