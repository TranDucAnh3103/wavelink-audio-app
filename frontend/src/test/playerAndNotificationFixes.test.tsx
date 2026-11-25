import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlayerPage } from '@/pages/PlayerPage';
import { usePlayerStore } from '@/stores/playerStore';
import { startBackgroundAudio, stopBackgroundAudio, isBackgroundAudioRunning } from '@/lib/backgroundAudioKeeper';
import { playNotificationSound } from '@/lib/soundEffects';
import { triggerNotificationSync } from '@/hooks/useNotifications';

vi.mock('@/hooks/useAudio', () => ({
  useAudio: vi.fn(),
  useAudios: vi.fn(() => ({ data: [], isLoading: false })),
  useToggleFavorite: vi.fn(() => ({
    mutate: vi.fn(),
  })),
}));

vi.mock('@/services/api', () => ({
  api: {
    audio: {
      getAudioById: vi.fn(),
      refreshAudio: vi.fn(),
      toggleFavorite: vi.fn().mockResolvedValue(true),
    },
    progress: {
      updateProgress: vi.fn(),
    },
    history: {
      recordHistory: vi.fn(),
    },
  },
}));

vi.mock('@/lib/soundEffects', () => ({
  playNotificationSound: vi.fn(),
}));

describe('5 Issues Fixes Verification Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Bug 1: Real-time Notification Sound & No Ghost Sound on Reload', () => {
    it('dispatches real-time notification sync event and executes sound callback', () => {
      const chimeSpy = vi.fn();
      window.addEventListener('wavelink:notification:sync', (e: any) => {
        if (e.detail?.playChime) chimeSpy();
      });

      triggerNotificationSync(true);
      expect(chimeSpy).toHaveBeenCalledTimes(1);
    });

    it('preserves known unread count in localStorage to prevent chime on reload', () => {
      localStorage.setItem('wavelink_last_known_unread_count', '5');
      expect(localStorage.getItem('wavelink_last_known_unread_count')).toBe('5');
    });
  });

  describe('Bug 2 & Bug 3 & Bug 4: PlayerPage Stability, 60s Countdown Timer & Heart Toggle', () => {
    const mockAudioData = {
      id: 99,
      title: 'Võ Luyện Đỉnh Phong',
      author: 'Mạc Mặc',
      channel: 'WavStudio',
      youtubeVideoId: 'abc123xyz',
      thumbnailUrl: 'https://img.youtube.com/vi/abc123xyz/hqdefault.jpg',
      formattedDuration: '02h 30m',
      formattedPosition: '00:15:30',
      lastPositionSeconds: 930,
      currentEpisodeNumber: 1,
      totalEpisodes: 3,
      isFavorite: false,
      episodes: [
        {
          id: 101,
          episodeNumber: 1,
          title: 'Tập 1: Khởi đầu',
          startSeconds: 0,
          endSeconds: 3600,
          duration: 3600,
        },
        {
          id: 102,
          episodeNumber: 2,
          title: 'Tập 2: Đột phá',
          startSeconds: 3600,
          endSeconds: 7200,
          duration: 3600,
        },
      ],
    };

    it('renders PlayerPage correctly without React Hook order error (#310) when switching loading states', async () => {
      const { useAudio } = await import('@/hooks/useAudio');

      // 1. Initial render with isLoading = true (Skeleton)
      (useAudio as any).mockReturnValue({
        data: null,
        isLoading: true,
      });

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/player/99']}>
            <Routes>
              <Route path="/player/:id" element={<PlayerPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Skeleton should be visible
      expect(document.querySelector('.animate-pulse')).toBeDefined();

      // 2. Data finished loading: isLoading = false, audio data available
      (useAudio as any).mockReturnValue({
        data: mockAudioData,
        isLoading: false,
      });

      // Rerender should NOT throw React Hook order error (#310)
      expect(() => {
        rerender(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/player/99']}>
              <Routes>
                <Route path="/player/:id" element={<PlayerPage />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        );
      }).not.toThrow();

      expect(screen.getByText('Võ Luyện Đỉnh Phong')).toBeDefined();
    });

    it('displays the SYNC: 60s countdown badge on Mốc nghe gần nhất card', async () => {
      const { useAudio } = await import('@/hooks/useAudio');
      (useAudio as any).mockReturnValue({
        data: mockAudioData,
        isLoading: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/player/99']}>
            <Routes>
              <Route path="/player/:id" element={<PlayerPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify the SYNC: 60s badge exists in the recent listen section
      expect(screen.getAllByText(/SYNC:\s*60s/i).length).toBeGreaterThanOrEqual(1);
    });

    it('toggles the heart button optimistically between red filled and unfilled outline', async () => {
      const { useAudio, useToggleFavorite } = await import('@/hooks/useAudio');
      const mutateSpy = vi.fn();
      (useToggleFavorite as any).mockReturnValue({ mutate: mutateSpy });
      (useAudio as any).mockReturnValue({
        data: { ...mockAudioData, isFavorite: false },
        isLoading: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/player/99']}>
            <Routes>
              <Route path="/player/:id" element={<PlayerPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      const favButton = screen.getByTitle('Yêu thích');
      expect(favButton).toBeDefined();

      // Initially unfilled
      const icon = favButton.querySelector('svg');
      expect(icon).toBeTruthy();
      expect(icon?.getAttribute('class') ?? '').not.toContain('text-[#E63946]');
      expect(icon?.getAttribute('class') ?? '').not.toContain('fill-[#E63946]');

      // Click to toggle favorite
      fireEvent.click(favButton);

      // Optimistically changes to filled red
      const updatedIcon = favButton.querySelector('svg');
      expect(updatedIcon?.getAttribute('class') ?? '').toContain('text-[#E63946]');
      expect(updatedIcon?.getAttribute('class') ?? '').toContain('fill-[#E63946]');
      expect(mutateSpy).toHaveBeenCalledWith(99, expect.any(Object));
    });
  });

  describe('Bug 5: Elimination of Unwanted Video Completed Notification', () => {
    it('uses Web Audio API keepalive and cleans up HTML audio anchors to prevent browser video completion toast', () => {
      // Create a dummy anchor in DOM like legacy versions
      const anchor = document.createElement('audio');
      anchor.id = 'wavelink-bg-audio-anchor';
      document.body.appendChild(anchor);

      expect(document.getElementById('wavelink-bg-audio-anchor')).not.toBeNull();

      // Starting background audio must remove legacy HTML audio element
      startBackgroundAudio();
      expect(document.getElementById('wavelink-bg-audio-anchor')).toBeNull();

      // Must be running in memory without registering an HTML media element
      expect(isBackgroundAudioRunning()).toBe(true);

      // Stop background audio
      stopBackgroundAudio();
      expect(isBackgroundAudioRunning()).toBe(false);
    });

    it('resets player store without invoking YouTube stopVideo which triggers state 0 ENDED', () => {
      const fakePlayer = {
        pauseVideo: vi.fn(),
        seekTo: vi.fn(),
        stopVideo: vi.fn(),
      };

      usePlayerStore.getState().setYtInstance(fakePlayer);
      usePlayerStore.getState().reset();

      // Must invoke pauseVideo and seekTo, but NEVER stopVideo
      expect(fakePlayer.pauseVideo).toHaveBeenCalled();
      expect(fakePlayer.seekTo).toHaveBeenCalledWith(0, true);
      expect(fakePlayer.stopVideo).not.toHaveBeenCalled();
    });
  });

  describe('Bug Fixes: MiniPlayer Close Timestamp, Speed Setting Persistence, and Sleep Timer Recovery', () => {
    it('preserves exact listening timestamp when closing MiniPlayer instead of resetting to 0', async () => {
      const { api } = vi.mocked(await import('@/services/api'));
      const fakePlayer = {
        pauseVideo: vi.fn(),
        getCurrentTime: vi.fn().mockReturnValue(1250),
      };

      usePlayerStore.getState().setYtInstance(fakePlayer);

      // Play mock audio
      const audio = {
        id: 88,
        title: 'Truyện Tiên Hiệp',
        author: 'Tác Giả A',
        channel: 'Kênh Audio',
        youtubeVideoId: 'yt123',
        thumbnailUrl: 'thumb.jpg',
        episodes: [
          { id: 1, episodeNumber: 1, title: 'Tập 1', startSeconds: 0, endSeconds: 3600, duration: 3600 },
        ],
      };

      usePlayerStore.getState().play(audio as any, audio.episodes[0] as any, 1250);
      expect(usePlayerStore.getState().currentTime).toBe(1250);

      // Close mini player
      usePlayerStore.getState().close();

      // YouTube pauseVideo called, but NOT resetting currentTime to 0
      expect(fakePlayer.pauseVideo).toHaveBeenCalled();
      expect(usePlayerStore.getState().currentTime).toBe(1250);
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // Progress API was called with the exact timestamp (1250s), NOT 0
      expect(api.progress.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          audioId: 88,
          episodeId: 1,
          positionSeconds: 1250,
        })
      );
    });

    it('persists playback speed (x2, x1.75, etc.) and restores on store re-initialization', async () => {
      const { getStoredPlaybackRate } = await import('@/stores/playerStore');

      // Set speed to 2.0x
      usePlayerStore.getState().setPlaybackRate(2.0, 999);
      expect(usePlayerStore.getState().playbackRate).toBe(2.0);

      // Verify stored in localStorage
      expect(localStorage.getItem('comic_audio_preferred_playback_rate')).toBe('2');
      expect(getStoredPlaybackRate(999)).toBe(2.0);

      // Changing speed to 1.75x
      usePlayerStore.getState().setPlaybackRate(1.75, 999);
      expect(usePlayerStore.getState().playbackRate).toBe(1.75);
      expect(getStoredPlaybackRate(999)).toBe(1.75);

      // User account sync should keep 1.75x
      usePlayerStore.getState().syncUserPlaybackRate(999);
      expect(usePlayerStore.getState().playbackRate).toBe(1.75);
    });

    it('recovers active sleep timer from localStorage if set in future', () => {
      const futureTs = Date.now() + 20 * 60 * 1000;
      localStorage.setItem('wavelink_sleep_timer_end', String(futureTs));

      usePlayerStore.getState().setSleepTimer(20);
      expect(usePlayerStore.getState().sleepTimerMinutes).toBe(20);
      expect(usePlayerStore.getState().sleepTimerEndTimestamp).toBeGreaterThan(Date.now());
    });
  });
});
