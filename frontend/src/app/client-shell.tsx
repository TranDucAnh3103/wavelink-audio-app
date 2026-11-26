'use client';

import React, { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { MiniPlayer } from '@/components/layout/MiniPlayer';
import { AudioEngineHost } from '@/components/layout/AudioEngineHost';
import { ToastContainer } from '@/components/ui/Toast';
import { usePlayerStore } from '@/stores/playerStore';
import { useShallow } from 'zustand/react/shallow';
import { peekLibraryReturnState } from '@/lib/libraryNavigationState';

const ScreenLockOverlay = dynamic(
  () => import('@/components/layout/ScreenLockOverlay').then((m) => m.ScreenLockOverlay),
  { ssr: false }
);

function ShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const isAuthPage = pathname === '/login' || pathname === '/register';
  const { isScreenLocked, setScreenLocked, hasCurrentAudio } = usePlayerStore(
    useShallow((s) => ({
      isScreenLocked: s.isScreenLocked,
      setScreenLocked: s.setScreenLocked,
      hasCurrentAudio: Boolean(s.currentAudio),
    }))
  );

  useEffect(() => {
    if (pathname === '/library' && peekLibraryReturnState()) {
      return;
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo(0, 0);
      } catch {}
    }
  }, [pathname]);

  return (
    <div className="app-shell">
      {!isAuthPage && (
        <>
          <Suspense fallback={null}>
            <SidebarNav />
          </Suspense>
          <Suspense fallback={<div className="h-14 md:h-16" />}>
            <Header />
          </Suspense>
        </>
      )}

      <main
        id="app-main"
        className={`flex-1 flex flex-col relative w-full ${
          isAuthPage
            ? 'pt-4 md:pt-8 justify-center'
            : 'pt-16 md:pt-20 md:pl-[76px] lg:pl-60'
        }`}
      >
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </main>

      {!isAuthPage && <MiniPlayer />}
      {!isAuthPage && (
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      )}

      {isScreenLocked && hasCurrentAudio && (
        <ScreenLockOverlay onClose={() => setScreenLocked(false)} />
      )}

      <AudioEngineHost />
      <ToastContainer />
    </div>
  );
}

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ShellBody>{children}</ShellBody>
    </Suspense>
  );
}
