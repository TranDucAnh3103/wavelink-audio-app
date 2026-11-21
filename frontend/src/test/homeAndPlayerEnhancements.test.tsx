import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { extractSeriesBaseTitle, groupAudiosIntoSeries } from '@/lib/seriesGrouping';
import { HomePage } from '@/views/HomePage';
import { PlayerPage } from '@/views/PlayerPage';
import { AudioItem } from '@/types';

const mockAudios: AudioItem[] = [
  {
    id: 1,
    youtubeVideoId: 'vid-1',
    youtubeUrl: 'https://youtube.com/watch?v=vid-1',
    title: 'Trọng Sinh Thế Giới Ma Pháp Cơ Giới, Ta Dùng Khoa Học Kỹ Thuật Nghiền Nát Ma Pháp - Tập 1',
    author: 'Ngàn Lẻ Một Truyện',
    categoryId: 10,
    categoryName: 'Trọng Sinh',
    tags: ['Trọng Sinh', 'Khoa Học'],
    thumbnailUrl: 'https://img.youtube.com/vi/vid-1/hqdefault.jpg',
    totalDurationSeconds: 18000,
    formattedDuration: '5h 00m',
    totalEpisodes: 5,
    viewCount: 1200,
  },
  {
    id: 2,
    youtubeVideoId: 'vid-2',
    youtubeUrl: 'https://youtube.com/watch?v=vid-2',
    title: 'Trọng Sinh Thế Giới Ma Pháp Cơ Giới, Ta Dùng Khoa Học Kỹ Thuật Nghiền Nát Ma Pháp - Tập 2',
    author: 'Ngàn Lẻ Một Truyện',
    categoryId: 10,
    categoryName: 'Trọng Sinh',
    tags: ['Cơ Giới'],
    thumbnailUrl: 'https://img.youtube.com/vi/vid-2/hqdefault.jpg',
    totalDurationSeconds: 16200,
    formattedDuration: '4h 30m',
    totalEpisodes: 4,
    viewCount: 850,
  },
  {
    id: 3,
    youtubeVideoId: 'vid-3',
    youtubeUrl: 'https://youtube.com/watch?v=vid-3',
    title: '[Full] Đấu Phá Thương Khung - Phần 1',
    author: 'Audio Tiên Hiệp',
    categoryId: 11,
    categoryName: 'Huyền Huyễn',
    tags: ['Tiên Hiệp'],
    thumbnailUrl: 'https://img.youtube.com/vi/vid-3/hqdefault.jpg',
    totalDurationSeconds: 36000,
    formattedDuration: '10h 00m',
    totalEpisodes: 10,
    viewCount: 5000,
  },
  {
    id: 4,
    youtubeVideoId: 'vid-4',
    youtubeUrl: 'https://youtube.com/watch?v=vid-4',
    title: 'Đấu Phá Thương Khung - Phần 2',
    author: 'Audio Tiên Hiệp',
    categoryId: 11,
    categoryName: 'Huyền Huyễn',
    tags: ['Tiên Hiệp'],
    thumbnailUrl: 'https://img.youtube.com/vi/vid-4/hqdefault.jpg',
    totalDurationSeconds: 28800,
    formattedDuration: '8h 00m',
    totalEpisodes: 8,
    viewCount: 2100,
  },
  {
    id: 5,
    youtubeVideoId: 'vid-5',
    youtubeUrl: 'https://youtube.com/watch?v=vid-5',
    title: 'Truyện Ngắn Độc Lập Không Thuộc Bộ Nào',
    author: 'Podcast Việt',
    categoryId: 12,
    categoryName: 'Đô Thị',
    tags: ['Podcast'],
    thumbnailUrl: 'https://img.youtube.com/vi/vid-5/hqdefault.jpg',
    totalDurationSeconds: 7200,
    formattedDuration: '2h 00m',
    totalEpisodes: 1,
    viewCount: 300,
  },
];

vi.mock('@/hooks/useAudio', () => ({
  useAudios: () => ({ data: mockAudios, isLoading: false }),
  useAudio: () => ({
    data: {
      ...mockAudios[0],
      description: 'Mô tả siêu phẩm trọng sinh ma pháp cơ giới.',
      tags: ['Trọng Sinh', '#Khoa Học', 'Chế Tạo'],
      episodes: [
        {
          id: 101,
          episodeNumber: 1,
          title: 'Tập 1',
          startSeconds: 0,
          endSeconds: 3600,
          duration: 3600,
        },
      ],
    },
    isLoading: false,
  }),
  useToggleFavorite: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/useStats', () => ({
  useStats: () => ({ data: { totalAudios: 5 }, isLoading: false }),
}));

vi.mock('@/hooks/useHistory', () => ({
  useRecentHistory: () => ({ data: [] }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 10, name: 'Trọng Sinh' },
      { id: 11, name: 'Huyền Huyễn' },
      { id: 12, name: 'Đô Thị' },
      { id: 13, name: 'Kiếm Hiệp' },
    ],
  }),
}));

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({
    data: [
      { id: 1, name: 'Trọng Sinh' },
      { id: 2, name: 'Huyền Huyễn' },
    ],
  }),
}));

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="route-location">{location.pathname + location.search}</div>;
};

function createTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('Series Grouping Utility', () => {
  it('strips episode/part/full markers accurately and groups multi-part series only', () => {
    expect(extractSeriesBaseTitle('[Full] Đấu Phá Thương Khung - Phần 1')).toBe(
      'Đấu Phá Thương Khung'
    );
    expect(extractSeriesBaseTitle('Full 700 Tập | HÓA THÀNH THẦN THỤ')).toBe(
      'HÓA THÀNH THẦN THỤ'
    );

    const groups = groupAudiosIntoSeries(mockAudios);
    expect(groups).toHaveLength(2);

    const dpGroup = groups.find((g) => g.seriesTitle === 'Đấu Phá Thương Khung');
    expect(dpGroup).toBeDefined();
    expect(dpGroup?.partCount).toBe(2);
    expect(dpGroup?.totalEpisodes).toBe(18);
    expect(
      dpGroup?.items.every((item) =>
        item.title.toLowerCase().includes((dpGroup?.searchQuery || '').toLowerCase())
      )
    ).toBe(true);

    expect(groups.some((g) => g.seriesTitle.includes('Truyện Ngắn Độc Lập'))).toBe(false);
  });
});

describe('HomePage UX & Discovery Sections', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps category pills in a single scrollable horizontal row on mobile without wrapping', () => {
    const qc = createTestClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/home" element={<HomePage />} />
            <Route path="/library" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const allCategoryBtn = screen.getByRole('button', { name: /^Tất cả$/i });
    const row = allCategoryBtn.parentElement;
    expect(row?.className).toContain('flex-nowrap');
    expect(row?.className).toContain('overflow-x-auto');
    expect(row?.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/);
  });

  it('renders auto-grouped Series, Marathon, Tags, and Top Authors sections and navigates filtered library URLs', () => {
    const qc = createTestClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/home" element={<HomePage />} />
            <Route path="/library" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Bộ Truyện Nhiều Phần \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Cày Xuyên Đêm/i)).toBeInTheDocument();
    expect(screen.getByText(/Từ Khóa Nổi Bật/i)).toBeInTheDocument();
    expect(screen.getByText(/Kênh & Tác Giả Nổi Bật/i)).toBeInTheDocument();

    const seriesHeading = screen.getByRole('heading', { name: 'Đấu Phá Thương Khung' });
    fireEvent.click(seriesHeading);

    const dest = screen.getByTestId('route-location').textContent || '';
    expect(dest).toContain('/library?search=');
    expect(decodeURIComponent(dest)).toContain('Đấu Phá Thương Khung');
  });
});

describe('PlayerPage Auto-Open Details & Tags', () => {
  it('opens video details accordion by default with tags displayed and keeps collapse toggle working', () => {
    const qc = createTestClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/1']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage />} />
            <Route path="/library" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const accordionBtn = screen.getByRole('button', {
      name: /Thông tin chi tiết & Nguồn YouTube/i,
    });
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Mô tả siêu phẩm trọng sinh ma pháp cơ giới.')).toBeInTheDocument();
    expect(screen.getByText(/Thẻ gắn \(3\):/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#Khoa Học' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#Chế Tạo' })).toBeInTheDocument();

    // User can still collapse and re-expand details
    fireEvent.click(accordionBtn);
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByText('Mô tả siêu phẩm trọng sinh ma pháp cơ giới.')
    ).not.toBeInTheDocument();

    fireEvent.click(accordionBtn);
    expect(accordionBtn).toHaveAttribute('aria-expanded', 'true');
  });
});
