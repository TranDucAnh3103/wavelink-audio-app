import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LibraryPage } from '@/views/LibraryPage';
import { PlayerPage } from '@/views/PlayerPage';
import { MiniPlayer } from '@/components/layout/MiniPlayer';
import { axiosClient } from '@/lib/axiosClient';
import { audioService } from '@/services/audioService';
import { HtmlAudioEngine } from '@/lib/audio/HtmlAudioEngine';
import { usePlayerStore, htmlAudioEngine } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { initMobileBridge } from '@/lib/mobileBridge';
import { clearLibraryReturnState } from '@/lib/libraryNavigationState';
import { AudioItem } from '@/types';

const makeAudio = (id: number, title = `Truyện ${id}`): AudioItem => ({
  id,
  youtubeVideoId: `vid_${id}`,
  youtubeUrl: `https://youtube.com/watch?v=vid_${id}`,
  title,
  author: 'Tác Giả Test',
  categoryId: 1,
  categoryName: 'Tiên Hiệp',
  tags: [],
  thumbnailUrl: `https://img.youtube.com/vi/vid_${id}/hqdefault.jpg`,
  totalDurationSeconds: 7200,
  formattedDuration: '2h 00m',
  totalEpisodes: 2,
  viewCount: 100 + id,
  isFavorite: false,
  episodes: [
    {
      id: id * 10 + 1,
      episodeNumber: 1,
      title: 'Tập 1',
      startSeconds: 0,
      endSeconds: 3600,
      duration: 3600,
    },
    {
      id: id * 10 + 2,
      episodeNumber: 2,
      title: 'Tập 2',
      startSeconds: 3600,
      endSeconds: 7200,
      duration: 3600,
    },
  ],
});

describe('UX Upgrades: Library Pagination, Hybrid Swap, Loading Spinner & Retry, Mobile Zoom Lock', () => {
  const origHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    clearLibraryReturnState();
    usePlayerStore.getState().reset();
    useAuthStore.setState({ isLive: true, user: null, isInitialized: true, isLoading: false });
    document.documentElement.classList.remove('wavelink-mobile-webview');
  });

  afterEach(() => {
    usePlayerStore.getState().setAudioElement(null);
    usePlayerStore.getState().reset();
    vi.useRealTimers();
    if (origHidden) {
      Object.defineProperty(Document.prototype, 'hidden', origHidden);
    }
    delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.remove();
  });

  it('keeps Library pagination visible across audio playback, favorite toggle, and new audio invalidation', async () => {
    const page1Audios = Array.from({ length: 12 }, (_, idx) => makeAudio(idx + 1, `Truyện Trang 1 #${idx + 1}`));
    let totalCount = 24;

    vi.spyOn(axiosClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/audios')) {
        return {
          data: {
            success: true,
            data: page1Audios.map((a) => ({ ...a })),
            meta: {
              total: totalCount,
              page: 1,
              limit: 12,
              totalPages: Math.ceil(totalCount / 12),
            },
          },
        } as never;
      }
      return { data: { success: true, data: [] } } as never;
    });

    vi.spyOn(axiosClient, 'post').mockResolvedValue({
      data: { success: true, data: { isFavorite: true } },
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/library']}>
          <Routes>
            <Route path="/library" element={<LibraryPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Truyện Trang 1 #1');
    expect(screen.getByTitle('Trang sau')).toBeInTheDocument();
    expect(screen.getByText(/Tổng/)).toHaveTextContent('Tổng 24 mục');

    // Toggle favorite (mutates cached array via map) -> pagination must remain intact
    const favBtn = screen.getByLabelText('Yêu thích Truyện Trang 1 #1');
    fireEvent.click(favBtn);

    // Simulate listening + adding a new audio and invalidating ['audios']
    totalCount = 25;
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['audios'] });
    });

    await waitFor(() => {
      expect(screen.getByText(/Tổng/)).toHaveTextContent('Tổng 25 mục');
    });
    expect(screen.getByTitle('Trang sau')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('starts on YouTube immediately and swaps seamlessly to HTML5 <audio> when preloaded', async () => {
    vi.useFakeTimers();

    const audioEl = document.createElement('audio');
    audioEl.load = vi.fn();
    audioEl.play = vi.fn().mockResolvedValue(undefined);
    audioEl.pause = vi.fn();

    const fakeYtPlayer = {
      loadVideoById: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      getCurrentTime: vi.fn().mockReturnValue(125),
      getPlaybackRate: vi.fn().mockReturnValue(1),
      getPlayerState: vi.fn().mockReturnValue(1),
      getVideoData: vi.fn().mockReturnValue({ video_id: 'vid_901' }),
    };

    vi.spyOn(audioService, 'getStreamToken').mockResolvedValue({
      streamToken: 'tok_swap_901',
      videoId: 'vid_901',
      streamPath: '/stream/vid_901?st=tok_swap_901',
      streamUrl: 'https://stream.example.com/stream/vid_901?st=tok_swap_901',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    usePlayerStore.getState().setAudioElement(audioEl);
    usePlayerStore.getState().setYtInstance(fakeYtPlayer);

    const track = makeAudio(901, 'Truyện Swap Mượt');
    usePlayerStore.getState().play(track, track.episodes![0], 120);

    // Immediately playing via YouTube with preload pending
    let state = usePlayerStore.getState();
    expect(state.activeEngine).toBe('youtube');
    expect(state.isPlaying).toBe(true);
    expect(state.isSwappingToStream).toBe(true);
    expect(fakeYtPlayer.loadVideoById).toHaveBeenCalledWith({
      videoId: 'vid_901',
      startSeconds: 120,
    });

    // Advance past 450ms preload debounce
    await vi.advanceTimersByTimeAsync(500);
    expect(audioEl.src).toContain('vid_901');
    expect(audioEl.muted).toBe(true);

    // Simulate <audio> finishing metadata & canplay
    Object.defineProperty(audioEl, 'readyState', { configurable: true, get: () => 3 });
    audioEl.dispatchEvent(new Event('loadedmetadata'));
    audioEl.dispatchEvent(new Event('canplay'));
    await vi.advanceTimersByTimeAsync(50);

    state = usePlayerStore.getState();
    expect(state.activeEngine).toBe('stream');
    expect(state.isSwappingToStream).toBe(false);
    expect(fakeYtPlayer.pauseVideo).toHaveBeenCalled();
    expect(audioEl.muted).toBe(false);
    expect(audioEl.play).toHaveBeenCalled();
  });

  it('rolls back to YouTube if <audio> play() rejects during swap', async () => {
    vi.useFakeTimers();

    const audioEl = document.createElement('audio');
    audioEl.load = vi.fn();
    audioEl.play = vi.fn().mockRejectedValue(Object.assign(new Error('NotAllowed'), { name: 'NotAllowedError' }));
    audioEl.pause = vi.fn();

    const fakeYtPlayer = {
      loadVideoById: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      getCurrentTime: vi.fn().mockReturnValue(30),
      getPlaybackRate: vi.fn().mockReturnValue(1),
      getPlayerState: vi.fn().mockReturnValue(1),
      getVideoData: vi.fn().mockReturnValue({ video_id: 'vid_902' }),
    };

    vi.spyOn(audioService, 'getStreamToken').mockResolvedValue({
      streamToken: 'tok_swap_902',
      videoId: 'vid_902',
      streamPath: '/stream/vid_902?st=tok_swap_902',
      streamUrl: 'https://stream.example.com/stream/vid_902?st=tok_swap_902',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    usePlayerStore.getState().setAudioElement(audioEl);
    usePlayerStore.getState().setYtInstance(fakeYtPlayer);

    const track = makeAudio(902, 'Truyện Rollback');
    usePlayerStore.getState().play(track, track.episodes![0], 30);

    await vi.advanceTimersByTimeAsync(500);
    Object.defineProperty(audioEl, 'readyState', { configurable: true, get: () => 3 });
    audioEl.dispatchEvent(new Event('loadedmetadata'));
    await vi.advanceTimersByTimeAsync(50);

    const state = usePlayerStore.getState();
    expect(state.activeEngine).toBe('youtube');
    expect(state.isSwappingToStream).toBe(false);
    expect(fakeYtPlayer.playVideo).toHaveBeenCalledTimes(2);
  });

  it('renders loading spinner on Play/Pause buttons while buffering and triggers retryPlayback', async () => {
    const track = makeAudio(903, 'Truyện Đang Tải');
    vi.spyOn(audioService, 'getAudioById').mockResolvedValue(track);
    const audioEl = document.createElement('audio');
    audioEl.load = vi.fn();
    audioEl.play = vi.fn().mockResolvedValue(undefined);
    audioEl.pause = vi.fn();
    usePlayerStore.getState().setAudioElement(audioEl);

    vi.spyOn(audioService, 'getStreamToken').mockResolvedValue({
      streamToken: 'tok_retry_903',
      videoId: 'vid_903',
      streamPath: '/stream/vid_903?st=tok_retry_903',
      streamUrl: 'https://stream.example.com/stream/vid_903?st=tok_retry_903',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    usePlayerStore.setState({
      currentAudio: track,
      currentEpisode: track.episodes![0],
      isPlaying: true,
      isBuffering: true,
      isRetrying: true,
      retryAttempt: 2,
      isExplicitlyPaused: false,
      bufferingStartedAt: Date.now() - 5000,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/903']}>
          <Routes>
            <Route
              path="/player/:id"
              element={
                <>
                  <PlayerPage initialAudio={track} />
                  <MiniPlayer />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const spinners = await screen.findAllByLabelText('Đang tải âm thanh');
    expect(spinners.length).toBeGreaterThanOrEqual(2);

    const retryBtn = screen.getByTestId('player-retry-btn');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(audioService.getStreamToken).toHaveBeenCalled();
    });
  });

  it('auto-retries stalled HtmlAudioEngine load even when screen is off (document.hidden)', async () => {
    vi.useFakeTimers();
    const tokenSpy = vi.fn().mockResolvedValue({
      streamToken: 'tok_bg',
      videoId: 'vid_bg_stall',
      streamPath: '/stream/vid_bg_stall?st=tok_bg',
      streamUrl: 'https://stream.example.com/stream/vid_bg_stall?st=tok_bg',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    const engine = new HtmlAudioEngine(tokenSpy);
    const el = document.createElement('audio');
    Object.defineProperty(el, 'readyState', { configurable: true, get: () => 0 });
    el.load = vi.fn();
    el.play = vi.fn().mockResolvedValue(undefined);
    el.pause = vi.fn();
    engine.attachElement(el);

    await engine.load({
      audioId: 904,
      videoId: 'vid_bg_stall',
      episodeId: 1,
      startSeconds: 60,
      autoplay: true,
      playbackRate: 1.0,
    });
    expect(tokenSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    // Advance 12s -> checkHealth() detects stalled load -> schedules 1000ms retry #1
    await vi.advanceTimersByTimeAsync(12500);
    engine.checkHealth();
    await vi.advanceTimersByTimeAsync(1100);

    expect(tokenSpy).toHaveBeenCalledTimes(2);
    expect(el.src).toContain('retry=');
    engine.destroy();
  });

  it('locks viewport and blocks multi-touch pinch zoom in Mobile WebView', () => {
    const vp = document.createElement('meta');
    vp.setAttribute('name', 'viewport');
    vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0');
    document.head.appendChild(vp);

    (window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } }).ReactNativeWebView = {
      postMessage: vi.fn(),
    };

    const cleanup = initMobileBridge();

    expect(document.documentElement.classList.contains('wavelink-mobile-webview')).toBe(true);
    expect(vp.getAttribute('content')).toContain('maximum-scale=1.0');
    expect(vp.getAttribute('content')).toContain('user-scalable=no');

    const pinchEvent = new Event('touchmove', { cancelable: true }) as unknown as TouchEvent;
    Object.defineProperty(pinchEvent, 'touches', { value: [{ clientX: 10 }, { clientX: 50 }] });
    document.dispatchEvent(pinchEvent);
    expect(pinchEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it('renders clean single-line episode cards without sub-text and switches CHƯA NGHE to live percentage when listening', async () => {
    const epAudio: AudioItem = {
      ...makeAudio(905, 'Truyện Tập Gọn'),
      totalDurationSeconds: 28800,
      totalEpisodes: 3,
      episodes: [
        {
          id: 9051,
          episodeNumber: 1,
          title: 'Tập 1 (00:00:00 - 04:00:00)',
          startSeconds: 0,
          endSeconds: 14400,
          duration: 14400,
          progressPercent: 0,
        },
        {
          id: 9052,
          episodeNumber: 2,
          title: 'Tập 2',
          startSeconds: 14400,
          endSeconds: 21600,
          duration: 7200,
          progressPercent: 35,
        },
        {
          id: 9053,
          episodeNumber: 3,
          title: 'Tập 3 (06:00:00 - 08:00:00)',
          startSeconds: 21600,
          endSeconds: 28800,
          duration: 7200,
          progressPercent: 100,
          completed: true,
        },
      ],
    };

    vi.spyOn(audioService, 'getAudioById').mockResolvedValue(epAudio);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/905']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage initialAudio={epAudio} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const card1 = await screen.findByTestId('episode-card-1');
    expect(card1).toHaveTextContent('Tập 1 (00:00:00 - 04:00:00)');
    // Small redundant sub-line ("00:00 - 04:00:00 · 0%") must not exist
    expect(card1.textContent).not.toContain('· 0%');
    expect(card1.textContent).toBe('T1Tập 1 (00:00:00 - 04:00:00)CHƯA NGHE');
    expect(screen.getByTestId('episode-status-badge-1')).toHaveTextContent('CHƯA NGHE');

    // Episode without time in title gets time range formatted inline, and shows ĐÃ NGHE 35%
    expect(screen.getByTestId('episode-card-2')).toHaveTextContent('Tập 2 (04:00:00 - 06:00:00)');
    expect(screen.getByTestId('episode-status-badge-2')).toHaveTextContent('ĐÃ NGHE 35%');
    expect(screen.getByTestId('episode-status-badge-3')).toHaveTextContent('ĐÃ XONG');

    // When Episode 1 is playing at 25% (3600s / 14400s), badge switches from CHƯA NGHE to 25% (without ĐANG PHÁT)
    act(() => {
      usePlayerStore.setState({
        currentAudio: epAudio,
        currentEpisode: epAudio.episodes![0],
        currentTime: 3600,
        duration: 14400,
        isPlaying: true,
      });
    });

    expect(screen.getByTestId('episode-status-badge-1').textContent).toBe('25%');
  });

  it('renders compact MiniPlayer with only Tập [số] - % and story title without episode time subtitle', () => {
    const audio = makeAudio(906, 'Truyện Mini Gọn');
    audio.episodes![0].title = 'Tập 1 (00:00:00 - 04:00:00)';
    usePlayerStore.setState({
      currentAudio: audio,
      currentEpisode: audio.episodes![0],
      currentTime: 1800,
      duration: 3600,
      isPlaying: false,
    });

    render(
      <MemoryRouter>
        <MiniPlayer />
      </MemoryRouter>
    );

    const card = screen.getByTestId('mini-player-card');
    expect(screen.getByTestId('mini-player-episode-badge')).toHaveTextContent('Tập 1 - 50%');
    expect(card).toHaveTextContent('Truyện Mini Gọn');
    expect(card.textContent).not.toContain('Tập 1 (00:00:00 - 04:00:00)');
  });

  it('keeps only 1 SYNC button (below) and switches to next episode from upper controls', async () => {
    const epAudio = makeAudio(907, 'Truyện Chuyển Tập');
    vi.spyOn(audioService, 'getAudioById').mockResolvedValue(epAudio);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/907']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage initialAudio={epAudio} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByTestId('player-upper-controls');
    // Only 1 SYNC button on PlayerPage (none inside Mốc nghe gần nhất bar)
    expect(screen.getAllByText(/SYNC:\s*60s/i)).toHaveLength(1);

    const nextBtn = screen.getByTestId('player-next-episode-btn');
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(usePlayerStore.getState().currentEpisode?.episodeNumber).toBe(2);
    });

    // At the last episode (2/2), next button becomes disabled
    expect(screen.getByTestId('player-next-episode-btn')).toBeDisabled();
  });

  it('tracks true end-of-episode sleep timer for a 4-hour chapter without 2h wall-clock cap and stops at episode end', async () => {
    const fourHourAudio: AudioItem = {
      ...makeAudio(908, 'Truyện 4 Tiếng'),
      totalDurationSeconds: 28800,
      totalEpisodes: 2,
      episodes: [
        {
          id: 9081,
          episodeNumber: 1,
          title: 'Tập 1 (00:00:00 - 04:00:00)',
          startSeconds: 0,
          endSeconds: 14400,
          duration: 14400,
          progressPercent: 0,
        },
        {
          id: 9082,
          episodeNumber: 2,
          title: 'Tập 2 (04:00:00 - 08:00:00)',
          startSeconds: 14400,
          endSeconds: 28800,
          duration: 14400,
          progressPercent: 0,
        },
      ],
    };

    vi.spyOn(audioService, 'getAudioById').mockResolvedValue(fourHourAudio);
    act(() => {
      usePlayerStore.setState({
        currentAudio: fourHourAudio,
        currentEpisode: fourHourAudio.episodes![0],
        currentTime: 0,
        duration: 14400,
        playbackRate: 2.0,
        isPlaying: true,
        isExplicitlyPaused: false,
      });
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/player/908']}>
          <Routes>
            <Route path="/player/:id" element={<PlayerPage initialAudio={fourHourAudio} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Chọn giờ ngủ' }));
    const endOfEpBtn = screen.getByTestId('sleep-end-of-episode-btn');
    // Shows true 04:00:00 remaining audio alongside rate-adjusted ~02:00:00 ETA at 2x
    expect(endOfEpBtn).toHaveTextContent('04:00:00');
    expect(endOfEpBtn).toHaveTextContent('~02:00:00 ở 2x');

    fireEvent.click(endOfEpBtn);

    const state = usePlayerStore.getState();
    expect(state.sleepTimerMode).toBe('end_of_episode');
    expect(state.sleepTimerEndTimestamp).toBeNull();
    expect(screen.getByTestId('sleep-timer-countdown-badge')).toHaveTextContent('Hết T1');

    // Reopening modal adapts ETA immediately when speed switches from 2x back to 1x
    act(() => {
      usePlayerStore.setState({ playbackRate: 1.0 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chọn giờ ngủ' }));
    expect(screen.getByTestId('sleep-modal-countdown')).toHaveTextContent('04:00:00');
    expect(screen.getByTestId('sleep-modal-countdown').textContent).not.toContain('02:00:00');

    // When Tập 1 finishes, playback stops instead of advancing to Tập 2 and clears sleep timer
    act(() => {
      usePlayerStore.getState().handleEpisodeComplete();
    });
    const afterComplete = usePlayerStore.getState();
    expect(afterComplete.isPlaying).toBe(false);
    expect(afterComplete.currentEpisode?.episodeNumber).toBe(1);
    expect(afterComplete.sleepTimerMode).toBeNull();
  });

  it('sorts listening history audios by longest listened duration combined with recency', async () => {
    const { sortListeningAudiosByDurationAndRecency } = await import('@/services/audioService');
    const now = Date.now();

    const skimNew: AudioItem = {
      ...makeAudio(1001, 'Mới Bấm 1 Giây'),
      totalDurationSeconds: 360000,
      lastPositionSeconds: 1,
      progressPercent: 0.01,
      updatedAt: new Date(now).toISOString(),
    };
    const staleLong: AudioItem = {
      ...makeAudio(1002, 'Nghe Lâu Nhưng Từ Tháng Trước'),
      totalDurationSeconds: 100000,
      lastPositionSeconds: 40000,
      progressPercent: 40,
      updatedAt: new Date(now - 35 * 86_400_000).toISOString(),
    };
    const activeBinge: AudioItem = {
      ...makeAudio(1003, 'Đang Cày Lâu Và Gần Đây'),
      totalDurationSeconds: 360000,
      lastPositionSeconds: 36000,
      progressPercent: 10,
      updatedAt: new Date(now - 2 * 3_600_000).toISOString(),
    };

    const sorted = sortListeningAudiosByDurationAndRecency([skimNew, staleLong, activeBinge]);
    expect(sorted.map((a) => a.title)).toEqual([
      'Đang Cày Lâu Và Gần Đây',
      'Nghe Lâu Nhưng Từ Tháng Trước',
      'Mới Bấm 1 Giây',
    ]);
  });
});
