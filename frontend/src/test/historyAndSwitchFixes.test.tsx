import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '@/views/HomePage';
import { ProfilePage } from '@/views/ProfilePage';
import { useAuthStore } from '@/stores/authStore';
import { ListeningHistoryItem } from '@/types';

function makeHistoryItems(count: number): ListeningHistoryItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: idx + 1,
    audioId: 100 + idx,
    episodeId: 1000 + idx,
    title: `Truyện Lịch Sử Số ${idx + 1}`,
    currentEpisodeId: 1000 + idx,
    currentEpisodeNumber: 1,
    currentEpisodeTitle: `Tập 1 (${idx + 1})`,
    episodeTitle: `Tập 1 (${idx + 1})`,
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    lastPositionSeconds: 300,
    formattedPosition: '05:00',
    progressPercent: 12,
    durationListened: 300,
    totalDurationListened: 300,
    createdAt: new Date(Date.now() - idx * 60000).toISOString(),
  }));
}

let mockHistoryList: ListeningHistoryItem[] = [];

vi.mock('@/hooks/useHistory', () => ({
  useRecentHistory: () => ({ data: mockHistoryList }),
}));

vi.mock('@/hooks/useAudio', () => ({
  useAudios: () => ({ data: [], isLoading: false }),
  useImportQuota: () => ({ data: null }),
}));

vi.mock('@/hooks/useStats', () => ({
  useStats: () => ({ data: { totalAudios: 15 }, isLoading: false }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
}));

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
}));

function createTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('Listening History Full Display & Xem tất cả Toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      user: {
        id: 7,
        username: 'StephenUser',
        email: 'stephen@test.local',
        role: 'USER',
        membership: 'FREE',
        isGuest: false,
      },
      token: 'valid-token',
      isLive: true,
      isLoading: false,
      isInitialized: true,
    });
  });

  it('HomePage shows 3 items by default and expands to all 6 items when clicking Xem tất cả', () => {
    mockHistoryList = makeHistoryItems(6);
    const qc = createTestClient();

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/home" element={<HomePage />} />
            <Route path="/profile" element={<div>Profile Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('6 bộ')).toBeInTheDocument();
    expect(screen.getByText('Truyện Lịch Sử Số 1')).toBeInTheDocument();
    expect(screen.getByText('Truyện Lịch Sử Số 3')).toBeInTheDocument();
    expect(screen.queryByText('Truyện Lịch Sử Số 4')).not.toBeInTheDocument();

    const toggleBtn = screen.getByTestId('home-toggle-all-history-btn');
    expect(toggleBtn).toHaveTextContent('Xem tất cả (6)');

    fireEvent.click(toggleBtn);
    expect(screen.getByText('Truyện Lịch Sử Số 4')).toBeInTheDocument();
    expect(screen.getByText('Truyện Lịch Sử Số 6')).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent('Thu gọn');

    fireEvent.click(toggleBtn);
    expect(screen.queryByText('Truyện Lịch Sử Số 4')).not.toBeInTheDocument();
  });

  it('ProfilePage displays all 15 history items beyond page size when clicking Xem tất cả (15)', () => {
    mockHistoryList = makeHistoryItems(15);
    const qc = createTestClient();

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/profile']}>
          <Routes>
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('15 BỘ TRUYỆN')).toBeInTheDocument();
    expect(screen.getByText('Truyện Lịch Sử Số 1')).toBeInTheDocument();
    expect(screen.queryByText('Truyện Lịch Sử Số 15')).not.toBeInTheDocument();

    const toggleBtn = screen.getByTestId('profile-toggle-all-history-btn');
    expect(toggleBtn).toHaveTextContent('Xem tất cả (15)');

    fireEvent.click(toggleBtn);
    expect(screen.getByText('Truyện Lịch Sử Số 13')).toBeInTheDocument();
    expect(screen.getByText('Truyện Lịch Sử Số 15')).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent('Thu gọn');
  });
});
