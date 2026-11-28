import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  buildAudioSlug,
  buildPlayerPath,
  extractAudioIdFromSlug,
  slugifyVietnamese,
} from '@/lib/slug';
import { PlayerPage } from '@/views/PlayerPage';
import { audioService } from '@/services/audioService';
import { useAuthStore } from '@/stores/authStore';
import { usePlayerStore } from '@/stores/playerStore';
import { AudioItem } from '@/types';

const permanentRedirectMock = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT:${url}`);
  (err as Error & { redirectTarget?: string }).redirectTarget = url;
  throw err;
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next/navigation');
  return {
    ...actual,
    permanentRedirect: (url: string) => permanentRedirectMock(url),
  };
});

const LocationViewer = () => {
  const loc = useLocation();
  return <div data-testid="loc-view">{`${loc.pathname}${loc.search}`}</div>;
};

const sampleAudio: AudioItem = {
  id: 189,
  youtubeVideoId: 'ytSlug189',
  youtubeUrl: 'https://youtube.com/watch?v=ytSlug189',
  title: 'Đấu Phá Thương Khung - Phần 1',
  author: 'Thiên Tàm Thổ Đậu',
  categoryId: 1,
  categoryName: 'Tiên Hiệp',
  tags: ['Tiên Hiệp', 'Full'],
  thumbnailUrl: 'https://img.youtube.com/vi/ytSlug189/hqdefault.jpg',
  totalDurationSeconds: 14400,
  formattedDuration: '4h 00m',
  totalEpisodes: 1,
  episodes: [
    {
      id: 1,
      episodeNumber: 1,
      title: 'Tập 1 (00:00:00 - 04:00:00)',
      startSeconds: 0,
      endSeconds: 14400,
      duration: 14400,
    },
  ],
};

describe('Option A SEO Slug Routing (/player/ten-truyen-id)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    permanentRedirectMock.mockClear();
    usePlayerStore.getState().reset();
    useAuthStore.setState({ user: { id: 1, username: 'tester', role: 'USER' } as never, isLive: true });
  });

  it('builds clean ASCII Vietnamese slugs and extracts trailing audio IDs accurately', () => {
    expect(slugifyVietnamese('Đấu Phá Thương Khung - Tập 1 (Full)')).toBe(
      'dau-pha-thuong-khung-tap-1-full'
    );
    expect(buildAudioSlug({ id: 189, title: 'Đấu Phá Thương Khung - Phần 1' })).toBe(
      'dau-pha-thuong-khung-phan-1-189'
    );
    expect(buildPlayerPath({ id: 189, title: 'Đấu Phá Thương Khung - Phần 1' }, { t: 120 })).toBe(
      '/player/dau-pha-thuong-khung-phan-1-189?t=120'
    );
    expect(buildAudioSlug({ id: 99, title: '' })).toBe('99');

    expect(extractAudioIdFromSlug('dau-pha-thuong-khung-phan-1-189')).toBe('189');
    expect(extractAudioIdFromSlug('truyen-nam-2026-42')).toBe('42');
    expect(extractAudioIdFromSlug('189')).toBe('189');
  });

  it('Next.js SSR generateMetadata sets slug canonical URL and redirects legacy numeric ID with 308', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: sampleAudio }),
    } as Response);

    const mod = await import('@/app/player/[id]/page');

    const meta = await mod.generateMetadata({
      params: { id: 'dau-pha-thuong-khung-phan-1-189' },
    });
    expect(meta.alternates?.canonical).toContain('/player/dau-pha-thuong-khung-phan-1-189');
    expect(meta.openGraph?.url).toContain('/player/dau-pha-thuong-khung-phan-1-189');

    await expect(
      mod.default({
        params: { id: '189' },
        searchParams: { t: '360' },
      })
    ).rejects.toThrow('NEXT_REDIRECT:/player/dau-pha-thuong-khung-phan-1-189?t=360');
    expect(permanentRedirectMock).toHaveBeenCalledWith(
      '/player/dau-pha-thuong-khung-phan-1-189?t=360'
    );
  });

  it('PlayerPage resolves audio from slug URL and canonicalizes legacy /player/189 URL in client SPA', async () => {
    const getByIdSpy = vi.spyOn(audioService, 'getAudioById').mockResolvedValue(sampleAudio);
    vi.spyOn(audioService, 'getAudios').mockResolvedValue([sampleAudio]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/189?t=65&ref=share']}>
          <Routes>
            <Route
              path="/player/:id"
              element={
                <>
                  <LocationViewer />
                  <PlayerPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(getByIdSpy).toHaveBeenCalledWith('189', true);
      expect(screen.getByTestId('loc-view')).toHaveTextContent(
        '/player/dau-pha-thuong-khung-phan-1-189?ref=share'
      );
    });

    // Ensures ?t=65 timestamp jump was still applied before cleanup
    expect(screen.getByText(/01:05/)).toBeInTheDocument();
    expect(document.title).toContain('Đấu Phá Thương Khung - Phần 1');
    const canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    expect(canonicalEl?.href).toContain('/player/dau-pha-thuong-khung-phan-1-189');
  });

  it('HomePage F5 boot shell in index.html shows skeleton instead of plain SEO banner and renders HomeSkeleton immediately while loading', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const indexHtml = fs.readFileSync(
      path.resolve(process.cwd(), 'index.html'),
      'utf8'
    );
    const rootBlockMatch = indexHtml.match(/<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/);
    const rootInner = rootBlockMatch ? rootBlockMatch[1] : '';
    // Boot shell must render skeleton primitives, keeping fallback text inside <noscript> only
    expect(rootInner).toContain('wl-boot-shell');
    expect(rootInner).toContain('wl-boot-sk');
    const withoutNoscript = rootInner.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
    expect(withoutNoscript).not.toContain('WaveLink — Nghe Audio, Sách Nói');
    expect(withoutNoscript).not.toContain('Đang tải kho truyện audio');

    vi.stubEnv('NODE_ENV', 'production');
    // Keep fetch pending so HomePage stays in initial loading state
    vi.spyOn(audioService, 'getAudios').mockImplementation(() => new Promise(() => {}));
    const { HomePage } = await import('@/views/HomePage');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/home']}>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(container.querySelector('.skeleton-shimmer')).not.toBeNull();
    expect(container.textContent).not.toContain('WaveLink — Nghe Audio, Sách Nói');
    vi.unstubAllEnvs();
  });
});
