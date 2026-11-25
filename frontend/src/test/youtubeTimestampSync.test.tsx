import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  buildYouTubeUrlAtTimestamp,
  extractYouTubeTimestamp,
  getAbsoluteYouTubeSeconds,
  mapAbsoluteSecondsToEpisode,
  parseYouTubeTimeInput,
} from '@/lib/youtubeSync';
import { PlayerPage } from '@/views/PlayerPage';
import { UploadPage } from '@/views/UploadPage';
import { Header } from '@/components/layout/Header';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { AudioItem } from '@/types';

const multiEpAudio: AudioItem = {
  id: 189,
  youtubeVideoId: 'ytSync18901',
  youtubeUrl: 'https://www.youtube.com/watch?v=ytSync18901',
  title: 'Kích Hoạt Hệ Thống Điểm Danh 10 Lần Một Ngày',
  author: 'KinN Truyện Audio',
  categoryId: 10,
  categoryName: 'Hệ Thống',
  tags: ['Hệ Thống', 'Full'],
  thumbnailUrl: 'https://img.youtube.com/vi/ytSync18901/hqdefault.jpg',
  totalDurationSeconds: 43200,
  formattedDuration: '12h 00m',
  totalEpisodes: 3,
  currentEpisodeId: 2,
  currentEpisodeNumber: 2,
  currentEpisodeTitle: 'Tập 2 (04:00:00 - 08:00:00)',
  lastPositionSeconds: 1800,
  formattedPosition: '30:00',
  progressPercent: 13,
  episodes: [
    {
      id: 1,
      episodeNumber: 1,
      title: 'Tập 1 (00:00:00 - 04:00:00)',
      startSeconds: 0,
      endSeconds: 14400,
      duration: 14400,
    },
    {
      id: 2,
      episodeNumber: 2,
      title: 'Tập 2 (04:00:00 - 08:00:00)',
      startSeconds: 14400,
      endSeconds: 28800,
      duration: 14400,
    },
    {
      id: 3,
      episodeNumber: 3,
      title: 'Tập 3 (08:00:00 - 12:00:00)',
      startSeconds: 28800,
      endSeconds: 43200,
      duration: 14400,
    },
  ],
};

let mockAudioData: AudioItem = multiEpAudio;
const mockImportMutateAsync = vi.fn();

vi.mock('@/hooks/useAudio', () => ({
  useAudio: () => ({ data: mockAudioData, isLoading: false }),
  useAudios: () => ({ data: [multiEpAudio], isLoading: false }),
  useToggleFavorite: () => ({ mutate: vi.fn() }),
  useImportYouTube: () => ({ mutateAsync: mockImportMutateAsync, isPending: false }),
  useImportQuota: () => ({
    data: {
      canImport: true,
      remaining: 5,
      todayImportCount: 0,
      maxImportsPerDay: 5,
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [{ id: 10, name: 'Hệ Thống', slug: 'he-thong' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useNotifications', () => ({
  useUnreadNotificationCount: () => ({ data: 0 }),
  triggerNotificationSync: vi.fn(),
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

describe('youtubeSync utility functions', () => {
  it('extracts timestamps across standard YouTube URL formats and manual time inputs', () => {
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=ytSync18901&t=33825s')).toBe(33825);
    expect(extractYouTubeTimestamp('https://youtu.be/ytSync18901?t=1h23m45s')).toBe(5025);
    expect(extractYouTubeTimestamp('https://m.youtube.com/watch?v=ytSync18901&start=600')).toBe(600);
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=ytSync18901#t=2m10s')).toBe(130);
    expect(extractYouTubeTimestamp('https://www.youtube.com/watch?v=ytSync18901')).toBeNull();

    expect(parseYouTubeTimeInput('09:23:45')).toEqual({ videoId: null, seconds: 33825 });
    expect(parseYouTubeTimeInput('https://youtu.be/ytSync18901?t=45s')).toEqual({
      videoId: 'ytSync18901',
      seconds: 45,
    });
  });

  it('builds synced YouTube URLs and maps absolute seconds to the right episode & offset', () => {
    expect(buildYouTubeUrlAtTimestamp('ytSync18901', 0)).toBe(
      'https://www.youtube.com/watch?v=ytSync18901'
    );
    expect(buildYouTubeUrlAtTimestamp('ytSync18901', 16200)).toBe(
      'https://www.youtube.com/watch?v=ytSync18901&t=16200s'
    );
    expect(getAbsoluteYouTubeSeconds({ startSeconds: 14400 }, 1800)).toBe(16200);

    // 33825s = 09:23:45 -> Episode 3 (start 28800) + 5025s (01:23:45)
    const mapped = mapAbsoluteSecondsToEpisode(multiEpAudio, 33825);
    expect(mapped).not.toBeNull();
    expect(mapped?.episode.episodeNumber).toBe(3);
    expect(mapped?.positionSeconds).toBe(5025);
    expect(mapped?.formattedEpisodePos).toBe('01:23:45');
    expect(mapped?.formattedAbsolute).toBe('09:23:45');

    // Beyond total end clamps cleanly inside final episode
    const clampedEnd = mapAbsoluteSecondsToEpisode(multiEpAudio, 999999);
    expect(clampedEnd?.episode.episodeNumber).toBe(3);
    expect(clampedEnd?.positionSeconds).toBe(14400);
  });
});

describe('Bidirectional YouTube <-> App Sync UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAudioData = multiEpAudio;
    usePlayerStore.setState({
      currentAudio: null,
      currentEpisode: null,
      isPlaying: false,
      currentTime: 0,
    });
    useAuthStore.setState({
      user: { id: 1, username: 'Stephen', role: 'USER', isGuest: false },
      token: 'mock-token',
      isLive: true,
      isLoading: false,
      isInitialized: true,
    });
  });

  it('PlayerPage App -> YouTube button embeds exact episode+offset timestamp and saves progress on click', async () => {
    const updateProgressSpy = vi.spyOn(api.progress, 'updateProgress').mockResolvedValue();
    const qc = createTestClient();

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/189']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Episode 2 starts at 14400 + lastPositionSeconds 1800 = 16200s (04:30:00)
    const ytLink = screen.getByTestId('open-youtube-synced-link');
    expect(ytLink).toHaveAttribute('href', 'https://www.youtube.com/watch?v=ytSync18901&t=16200s');
    expect(ytLink).toHaveTextContent('YouTube · 04:30:00');

    fireEvent.click(ytLink);
    expect(updateProgressSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        audioId: 189,
        episodeId: 2,
        positionSeconds: 1800,
      }),
      true
    );
  });

  it('PlayerPage auto-syncs incoming ?t=33825 to Tập 3 (01:23:45) and persists progress', async () => {
    const updateProgressSpy = vi.spyOn(api.progress, 'updateProgress').mockResolvedValue();
    const qc = createTestClient();

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/189?t=33825']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(updateProgressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          audioId: 189,
          episodeId: 3,
          positionSeconds: 5025,
          progressPercent: 35,
        }),
        true
      );
    });

    expect(screen.getByText(/01:23:45/)).toBeInTheDocument();
  });

  it('PlayerPage Đồng bộ YT modal previews target episode and saves pasted timestamp', async () => {
    const updateProgressSpy = vi.spyOn(api.progress, 'updateProgress').mockResolvedValue();
    const qc = createTestClient();

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/189']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByTestId('open-yt-sync-btn'));
    const input = screen.getByTestId('yt-sync-input');
    fireEvent.change(input, {
      target: { value: 'https://www.youtube.com/watch?v=ytSync18901&t=1h23m45s' },
    });

    const preview = screen.getByTestId('yt-sync-preview');
    expect(preview).toHaveTextContent('Tập 1');
    expect(preview).toHaveTextContent('01:23:45');

    fireEvent.click(screen.getByTestId('apply-yt-sync-btn'));

    await waitFor(() => {
      expect(updateProgressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          audioId: 189,
          episodeId: 1,
          positionSeconds: 5025,
        }),
        true
      );
    });
  });

  it('UploadPage detects ?t= timestamp badge and syncs timestamp after import', async () => {
    const previewSpy = vi.spyOn(api.audio, 'previewYouTube').mockResolvedValue({
      videoId: 'ytSync18901',
      title: 'Truyện Mới Đồng Bộ',
      author: 'KinN Truyện Audio',
      durationSeconds: 43200,
      formattedDuration: '12h 00m',
      thumbnailUrl: 'https://img.youtube.com/vi/ytSync18901/hqdefault.jpg',
    });
    const updateProgressSpy = vi.spyOn(api.progress, 'updateProgress').mockResolvedValue();
    mockImportMutateAsync.mockResolvedValue({
      duplicate: false,
      audio: multiEpAudio,
    });

    const qc = createTestClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[
            `/upload?url=${encodeURIComponent('https://www.youtube.com/watch?v=ytSync18901&t=33825')}`,
          ]}
        >
          <Routes>
            <Route path="/upload" element={<UploadPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(previewSpy).toHaveBeenCalled();
      expect(screen.getByTestId('upload-yt-timestamp-badge')).toHaveTextContent('09:23:45');
    });

    const submitBtn = document.getElementById('submit-import-btn') as HTMLButtonElement;
    await waitFor(() => expect(submitBtn.disabled).toBe(false));
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockImportMutateAsync).toHaveBeenCalled();
      expect(updateProgressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          audioId: 189,
          episodeId: 3,
          positionSeconds: 5025,
        }),
        true
      );
    });
  });

  it('Header quick search routes pasted YouTube URL with &t= directly to player or upload', async () => {
    const getAudiosSpy = vi.spyOn(api.audio, 'getAudios').mockResolvedValueOnce([multiEpAudio]);
    const qc = createTestClient();

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/home']}>
          <Header />
          <LocationDisplay />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const searchInput = screen.getByPlaceholderText(/Tìm audio, sách nói, tác giả, link YouTube/i);
    fireEvent.change(searchInput, {
      target: { value: 'https://www.youtube.com/watch?v=ytSync18901&t=33825' },
    });
    fireEvent.submit(searchInput.closest('form')!);

    await waitFor(() => {
      expect(getAudiosSpy).toHaveBeenCalledWith({ search: 'ytSync18901' }, true);
      expect(screen.getByTestId('route-location')).toHaveTextContent('/player/189?t=33825');
    });

    // When video is not yet imported, redirect to /upload?url=...
    getAudiosSpy.mockResolvedValueOnce([]);
    fireEvent.change(searchInput, {
      target: { value: 'https://www.youtube.com/watch?v=newVid99999&t=1200' },
    });
    fireEvent.submit(searchInput.closest('form')!);

    await waitFor(() => {
      const dest = screen.getByTestId('route-location').textContent || '';
      expect(dest).toContain('/upload?url=');
      expect(decodeURIComponent(dest)).toContain('newVid99999&t=1200');
    });
  });
});
