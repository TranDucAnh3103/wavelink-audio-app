import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { groupAudiosIntoSeries, countMeaningfulChars } from '@/lib/seriesGrouping';
import { LibraryPage } from '@/views/LibraryPage';
import { PlayerPage } from '@/views/PlayerPage';
import { MainLayout } from '@/components/layout/MainLayout';
import { audioService } from '@/services/audioService';
import { axiosClient } from '@/lib/axiosClient';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import {
  clearLibraryReturnState,
  peekLibraryReturnState,
} from '@/lib/libraryNavigationState';
import { AudioItem } from '@/types';

const makeAudio = (id: number, title: string, author = 'Vân Đạo Audio'): AudioItem => ({
  id,
  youtubeVideoId: `vid_${id}`,
  youtubeUrl: `https://youtube.com/watch?v=vid_${id}`,
  title,
  author,
  categoryId: 1,
  categoryName: 'Xuyên Không',
  thumbnailUrl: `https://img.youtube.com/vi/vid_${id}/hqdefault.jpg`,
  totalDurationSeconds: 14400,
  formattedDuration: '4h 00m',
  totalEpisodes: 2,
  viewCount: 100 + id,
  episodes: [
    { id: id * 10 + 1, episodeNumber: 1, title: 'Tập 1', startSeconds: 0, endSeconds: 7200, duration: 7200 },
    { id: id * 10 + 2, episodeNumber: 2, title: 'Tập 2', startSeconds: 7200, endSeconds: 14400, duration: 7200 },
  ],
});

const LocationTracker = () => {
  const loc = useLocation();
  return <div data-testid="loc-tracker">{`${loc.pathname}${loc.search}`}</div>;
};

describe('Series Grouping (>10 meaningful chars + same author)', () => {
  it('groups non-prefix matches with >10 meaningful shared chars and same author, while rejecting short or cross-author matches', () => {
    const audios: AudioItem[] = [
      makeAudio(1, 'Full Truyện : Xuyên Qua Chư Thiên Vạn Giới - Phần 1', 'Phàm Nhân Review 90'),
      makeAudio(2, '(Full) P2 - Xuyên Qua Chư Thiên Vạn Giới', 'Phàm Nhân Review 90'),
      makeAudio(3, 'Bá Đạo - Phần 1', 'Tác Giả Ngắn'),
      makeAudio(4, 'Bá Đạo - Phần 2', 'Tác Giả Ngắn'),
      makeAudio(5, 'Thần Hào Hệ Thống Toàn Năng Nhất - Phần 1', 'Kênh A'),
      makeAudio(6, 'Thần Hào Hệ Thống Toàn Năng Nhất - Phần 2', 'Kênh B'),
    ];

    expect(countMeaningfulChars('Bá Đạo')).toBeLessThanOrEqual(10);
    expect(countMeaningfulChars('Xuyên Qua Chư Thiên Vạn Giới')).toBeGreaterThan(10);

    const groups = groupAudiosIntoSeries(audios);
    expect(groups).toHaveLength(1);
    expect(groups[0].partCount).toBe(2);
    expect(groups[0].author).toBe('Phàm Nhân Review 90');
    expect(groups[0].items.map((a) => a.id)).toEqual([1, 2]);
  });
});

describe('Library Return-Position Restoration & Player Resilience & MiniPlayer Persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    clearLibraryReturnState();
    usePlayerStore.getState().reset();
    useAuthStore.setState({ isLive: false, user: null, isInitialized: true, isLoading: false });
  });

  afterEach(() => {
    usePlayerStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('saves library page and selected audio card and restores exact page & scroll target when returning', async () => {
    const page2Items = [
      makeAudio(13, 'Truyện Trang Hai Số 1'),
      makeAudio(14, 'Truyện Trang Hai Số 2'),
      makeAudio(15, 'Truyện Trang Hai Số 3'),
    ];
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    useAuthStore.setState({ isLive: true, user: null, isInitialized: true, isLoading: false });

    const axiosGetSpy = vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/audios')) {
        return {
          data: {
            success: true,
            data: page2Items,
            meta: { total: 24, page: 2, limit: 12, totalPages: 2 },
          },
        } as never;
      }
      return { data: { success: true, data: [] } } as never;
    });

    const qc1 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc1}>
        <MemoryRouter initialEntries={['/library?page=2']}>
          <Routes>
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/player/:id" element={<LocationTracker />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const cardTitle = await screen.findByText('Truyện Trang Hai Số 3');
    expect(axiosGetSpy.mock.calls.some(([u]) => String(u).includes('page=2'))).toBe(true);

    fireEvent.click(cardTitle);

    await waitFor(() => {
      expect(screen.getByTestId('loc-tracker').textContent).toBe('/player/truyen-trang-hai-so-3-15');
    });

    const saved = peekLibraryReturnState();
    expect(saved).not.toBeNull();
    expect(saved?.page).toBe(2);
    expect(saved?.audioId).toBe('15');
    unmount();

    // Return to /library without explicit ?page= param -> must restore page 2 and scroll to audio #15
    axiosGetSpy.mockClear();
    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc2}>
        <MemoryRouter initialEntries={['/library']}>
          <Routes>
            <Route path="/library" element={<LibraryPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Truyện Trang Hai Số 3');
    expect(axiosGetSpy.mock.calls.some(([u]) => String(u).includes('page=2'))).toBe(true);

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
    expect(peekLibraryReturnState()).toBeNull();
  });

  it('keeps PlayerPage showing currently playing audio instead of "Không tìm thấy bản ghi audio" on transient network errors after app switch', async () => {
    const playingAudio = makeAudio(777, 'Siêu Cấp Thần Hào Hệ Thống Đang Nghe');
    usePlayerStore.setState({
      currentAudio: playingAudio,
      currentEpisode: playingAudio.episodes![0],
      isPlaying: true,
    });
    useAuthStore.setState({ isLive: true });

    const getByIdSpy = vi
      .spyOn(audioService, 'getAudioById')
      .mockRejectedValue(new Error('Network timeout after backgrounding'));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/777']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Siêu Cấp Thần Hào Hệ Thống Đang Nghe')).toBeInTheDocument();
    expect(screen.queryByText(/Không tìm thấy bản ghi audio/i)).not.toBeInTheDocument();

    // Returning from app switcher (visibilitychange -> visible) should trigger background refetch
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => {
      expect(getByIdSpy).toHaveBeenCalled();
    });
  });

  it('keeps MiniPlayer mounted without reloading when a lazy Outlet route is loading', async () => {
    const playingAudio = makeAudio(888, 'MiniPlayer Persistent Audio');
    usePlayerStore.setState({
      currentAudio: playingAudio,
      currentEpisode: playingAudio.episodes![0],
      isPlaying: false,
    });

    const LazyPendingPage = lazy(() => new Promise<{ default: React.ComponentType }>(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/pending-lazy']}>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/pending-lazy" element={<LazyPendingPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('Đang tải dữ liệu...')).toBeInTheDocument();
    expect(await screen.findByTestId('mini-player-card')).toBeInTheDocument();
    expect(screen.getByText('MiniPlayer Persistent Audio')).toBeInTheDocument();
  });
});
