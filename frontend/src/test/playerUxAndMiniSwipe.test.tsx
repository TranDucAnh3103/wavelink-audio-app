import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PlayerPage } from '@/views/PlayerPage';
import { MiniPlayer } from '@/components/layout/MiniPlayer';
import { getRelatedAudios, filterRelatedAudios } from '@/lib/relatedAudios';
import { usePlayerStore } from '@/stores/playerStore';
import { AudioItem } from '@/types';

if (typeof globalThis.PointerEvent === 'undefined') {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'touch';
    }
  }
  // @ts-expect-error JSDOM PointerEvent polyfill for swipe gesture tests
  globalThis.PointerEvent = MockPointerEvent;
}

const baseCurrentAudio: AudioItem = {
  id: 189,
  youtubeVideoId: 'yt-189',
  youtubeUrl: 'https://youtube.com/watch?v=yt-189',
  title: '[Full] Kích Hoạt Hệ Thống Điểm Danh 10 Lần Một Ngày - Tập 1',
  author: 'KinN Truyện Audio',
  categoryId: 10,
  categoryName: 'Hệ Thống',
  tags: ['Full', '#Hệ Thống'],
  description:
    'Giới thiệu truyện rất dài để kiểm tra thu gọn mô tả trên trang player. ' +
    'Triệu Phàm là một nhân viên giao hàng bình thường bỗng xuyên không thành đích trưởng tử. ' +
    'Sau đó hắn kích hoạt hệ thống gia tộc khí vận mỗi ngày đánh dấu nhận thưởng cực khủng.',
  thumbnailUrl: 'https://img.youtube.com/vi/yt-189/hqdefault.jpg',
  totalDurationSeconds: 360000,
  formattedDuration: '100h 00m',
  totalEpisodes: 26,
  viewCount: 500,
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

function buildCatalog(count: number): AudioItem[] {
  const items: AudioItem[] = [baseCurrentAudio];
  for (let i = 1; i <= count; i += 1) {
    items.push({
      id: 200 + i,
      youtubeVideoId: `rel-${i}`,
      youtubeUrl: `https://youtube.com/watch?v=rel-${i}`,
      title:
        i <= 2
          ? `Kích Hoạt Hệ Thống Điểm Danh 10 Lần Một Ngày - Phần ${i + 1}`
          : i <= 8
            ? `Hệ Thống Điểm Danh Tu Tiên Truyện ${i}`
            : `Siêu Phẩm Đô Thị Khác ${i}`,
      author: i <= 6 ? 'KinN Truyện Audio' : `Tác Giả ${i}`,
      categoryId: i % 2 === 0 ? 10 : 99,
      categoryName: i % 2 === 0 ? 'Hệ Thống' : 'Huyền Huyễn',
      tags: i <= 15 ? ['Hệ Thống'] : ['Full'],
      thumbnailUrl: `https://img.youtube.com/vi/rel-${i}/hqdefault.jpg`,
      totalDurationSeconds: 18000,
      formattedDuration: '5h 00m',
      totalEpisodes: 5,
      viewCount: 1000 - i * 10,
    });
  }
  return items;
}

const largeCatalog = buildCatalog(25);
let mockActiveAudio: AudioItem = baseCurrentAudio;
let mockCatalog: AudioItem[] = largeCatalog;

vi.mock('@/hooks/useAudio', () => ({
  useAudio: () => ({ data: mockActiveAudio, isLoading: false }),
  useAudios: () => ({ data: mockCatalog, isLoading: false }),
  useToggleFavorite: () => ({ mutate: vi.fn() }),
}));

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="route-location">{location.pathname}</div>;
};

function createTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('Related Audios Utility', () => {
  it('scores candidates across title, author, tags, and category while excluding self', () => {
    const matches = getRelatedAudios(baseCurrentAudio, largeCatalog);

    expect(matches.some((m) => String(m.audio.id) === String(baseCurrentAudio.id))).toBe(false);
    expect(matches.length).toBe(25);

    // Exact series match ranks at the very top with "Cùng bộ" (202 matches series + author + tag + category)
    expect(matches[0].audio.id).toBe(202);
    expect(matches[0].primaryLabel).toBe('Cùng bộ');
    expect(matches[0].reasons).toContain('title');
    expect(matches[0].reasons).toContain('category');
    expect(matches[0].reasons).toContain('author');

    expect(filterRelatedAudios(matches, 'author').every((m) => m.reasons.includes('author'))).toBe(true);
    expect(filterRelatedAudios(matches, 'category').every((m) => m.reasons.includes('category'))).toBe(true);
    expect(filterRelatedAudios(matches, 'tag').every((m) => m.reasons.includes('tag'))).toBe(true);
    expect(filterRelatedAudios(matches, 'title').every((m) => m.reasons.includes('title'))).toBe(true);
  });
});

describe('PlayerPage Collapsible Description & Related Audios Carousel', () => {
  beforeEach(() => {
    mockActiveAudio = baseCurrentAudio;
    mockCatalog = largeCatalog;
    localStorage.clear();
    window.scrollTo = vi.fn();
  });

  it('clamps long description with Xem thêm mô tả toggle and omits toggle for short descriptions', () => {
    const qc = createTestClient();
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/189']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-description-btn');
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(toggleBtn).toHaveTextContent('Xem thêm mô tả');

    const descEl = screen.getByText(/Giới thiệu truyện rất dài/i);
    expect(descEl.className).toContain('line-clamp-3');

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(toggleBtn).toHaveTextContent('Thu gọn mô tả');
    expect(descEl.className).not.toContain('line-clamp-3');

    // Short description should not render toggle button
    mockActiveAudio = { ...baseCurrentAudio, id: 190, description: 'Mô tả ngắn gọn.' };
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/190']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.queryByTestId('toggle-description-btn')).not.toBeInTheDocument();
  });

  it('renders 10 related cards initially, loads 10 more on right scroll or button click, supports filtering, and navigates', () => {
    const qc = createTestClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/189']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage />} />
            <Route
              path="/player/kich-hoat-he-thong-diem-danh-10-lan-mot-ngay-phan-3-202"
              element={<LocationDisplay />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('related-audios-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('related-audio-card')).toHaveLength(10);

    // Simulate scrolling horizontally close to the right edge
    const scroller = screen.getByTestId('related-audios-scroller');
    Object.defineProperty(scroller, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(scroller, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(scroller, 'scrollLeft', { value: 1500, writable: true, configurable: true });
    fireEvent.scroll(scroller);

    expect(screen.getAllByTestId('related-audio-card')).toHaveLength(20);

    // Click remaining load-more button to get the final 5
    const loadMoreBtn = screen.getByRole('button', { name: /^Xem thêm$/i });
    fireEvent.click(loadMoreBtn);
    expect(screen.getAllByTestId('related-audio-card')).toHaveLength(25);

    // Filter by author (only 6 author matches)
    const authorTab = screen.getByRole('tab', { name: /Cùng tác giả/i });
    fireEvent.click(authorTab);
    expect(screen.getAllByTestId('related-audio-card')).toHaveLength(6);

    // Clicking first related card navigates to top match (202) with SEO slug
    fireEvent.click(screen.getAllByTestId('related-audio-card')[0]);
    expect(screen.getByTestId('route-location')).toHaveTextContent(
      '/player/kich-hoat-he-thong-diem-danh-10-lan-mot-ngay-phan-3-202'
    );
  });
});

describe('MiniPlayer Swipe-to-Dismiss with Red Translucent Overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePlayerStore.setState({
      currentAudio: baseCurrentAudio,
      currentEpisode: baseCurrentAudio.episodes![0],
      isPlaying: false,
      currentTime: 120,
      duration: 14400,
      playbackRate: 1.0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows red overlay on partial drag and springs back without closing', () => {
    const closeSpy = vi.spyOn(usePlayerStore.getState(), 'close');
    render(
      <MemoryRouter>
        <MiniPlayer />
      </MemoryRouter>
    );

    const card = screen.getByTestId('mini-player-card');
    expect(screen.queryByTestId('mini-player-dismiss-overlay')).not.toBeInTheDocument();

    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 200, clientY: 500 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 245, clientY: 502 });

    const overlay = screen.getByTestId('mini-player-dismiss-overlay');
    expect(overlay).toHaveTextContent('Kéo để tắt trình phát');

    // Slow small drag below dismiss threshold should spring back without closing
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 245, clientY: 502 });

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(closeSpy).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().currentAudio).not.toBeNull();
    expect(screen.queryByTestId('mini-player-dismiss-overlay')).not.toBeInTheDocument();
  });

  it('dismisses MiniPlayer when swiped right or left past threshold', () => {
    const { rerender } = render(
      <MemoryRouter>
        <MiniPlayer />
      </MemoryRouter>
    );

    let card = screen.getByTestId('mini-player-card');

    // Swipe right (+150px)
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 100, clientY: 500 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 250, clientY: 502 });
    expect(screen.getByTestId('mini-player-dismiss-overlay')).toHaveTextContent(
      'Thả để tắt trình phát'
    );

    fireEvent.pointerUp(card, { pointerId: 1, clientX: 250, clientY: 502 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(usePlayerStore.getState().currentAudio).toBeNull();

    // Restore audio and verify swipe left (-150px)
    act(() => {
      usePlayerStore.setState({ currentAudio: baseCurrentAudio });
    });
    rerender(
      <MemoryRouter>
        <MiniPlayer />
      </MemoryRouter>
    );

    card = screen.getByTestId('mini-player-card');
    fireEvent.pointerDown(card, { pointerId: 2, button: 0, clientX: 250, clientY: 500 });
    fireEvent.pointerMove(card, { pointerId: 2, clientX: 100, clientY: 501 });
    expect(screen.getByTestId('mini-player-dismiss-overlay')).toHaveTextContent(
      'Thả để tắt trình phát'
    );

    fireEvent.pointerUp(card, { pointerId: 2, clientX: 100, clientY: 501 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(usePlayerStore.getState().currentAudio).toBeNull();
  });

  it('keeps speed, play/pause, and lock buttons clickable without triggering swipe overlay', () => {
    render(
      <MemoryRouter>
        <MiniPlayer />
      </MemoryRouter>
    );

    const speedBtn = screen.getByRole('button', { name: 'Tốc độ phát' });
    fireEvent.pointerDown(speedBtn, { pointerId: 3, button: 0, clientX: 300, clientY: 500 });
    fireEvent.pointerMove(speedBtn, { pointerId: 3, clientX: 350, clientY: 500 });
    expect(screen.queryByTestId('mini-player-dismiss-overlay')).not.toBeInTheDocument();

    fireEvent.click(speedBtn);
    expect(usePlayerStore.getState().playbackRate).toBe(1.25);
  });
});
