import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '@/views/HomePage';
import { AudioFilter, AudioItem } from '@/types';

const allMockAudios: AudioItem[] = Array.from({ length: 80 }, (_, i) => ({
  id: i + 1,
  youtubeVideoId: `vid-${i + 1}`,
  youtubeUrl: `https://youtube.com/watch?v=vid-${i + 1}`,
  title: `Truyện Home Test ${i + 1}`,
  author: `Tác Giả ${i + 1}`,
  categoryId: 1,
  categoryName: 'Tiên Hiệp',
  tags: [],
  thumbnailUrl: `https://img.youtube.com/vi/vid-${i + 1}/hqdefault.jpg`,
  totalDurationSeconds: 3600,
  formattedDuration: '1h 00m',
  totalEpisodes: 1,
  viewCount: 100 + i,
}));

const requestedLimits: number[] = [];

vi.mock('@/hooks/useAudio', () => ({
  useAudios: (filter: AudioFilter = {}) => {
    if (filter.fields === 'catalog') {
      return { data: allMockAudios, isLoading: false, isFetching: false };
    }
    const limit = filter.limit || 36;
    requestedLimits.push(limit);
    return {
      data: allMockAudios.slice(0, limit),
      isLoading: false,
      isFetching: false,
    };
  },
}));

vi.mock('@/hooks/useStats', () => ({
  useStats: () => ({ data: { totalAudios: allMockAudios.length }, isLoading: false }),
}));

vi.mock('@/hooks/useHistory', () => ({
  useRecentHistory: () => ({ data: [] }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ id: 1, name: 'Tiên Hiệp' }] }),
}));

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
}));

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/library" element={<div>Library Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('HomePage 36-item Initial Render & Mobile/Desktop Load More', () => {
  beforeEach(() => {
    requestedLimits.length = 0;
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders 36 items initially and loads 72 on desktop Xem thêm button click without showing item counts', () => {
    renderHome();

    const scroller = screen.getByTestId('home-audios-scroller');
    expect(scroller.children).toHaveLength(36);
    expect(requestedLimits).toContain(36);

    const showMoreBtn = screen.getByTestId('home-show-more-audios-btn');
    expect(showMoreBtn).toHaveTextContent(/^Xem thêm$/);
    expect(showMoreBtn).not.toHaveTextContent(/\(\d+/);

    fireEvent.click(showMoreBtn);
    expect(requestedLimits).toContain(72);
    expect(screen.getByTestId('home-audios-scroller').children).toHaveLength(72);
  });

  it('loads more continuously when scrolling horizontally on mobile', () => {
    renderHome();

    const scroller = screen.getByTestId('home-audios-scroller');
    expect(scroller.children).toHaveLength(36);

    Object.defineProperty(scroller, 'clientWidth', { value: 360, configurable: true });
    Object.defineProperty(scroller, 'scrollWidth', { value: 5000, configurable: true });
    Object.defineProperty(scroller, 'scrollLeft', { value: 4550, writable: true, configurable: true });
    fireEvent.scroll(scroller);

    expect(requestedLimits).toContain(72);
    expect(screen.getByTestId('home-audios-scroller').children).toHaveLength(72);
  });
});
