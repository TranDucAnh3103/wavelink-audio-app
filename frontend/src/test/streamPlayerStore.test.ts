import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore, htmlAudioEngine } from '@/stores/playerStore';
import { audioService } from '@/services/audioService';
import { AudioItem } from '@/types';

const multiChapterAudio: AudioItem = {
  id: 500,
  youtubeVideoId: 'streamChap12',
  youtubeUrl: 'https://youtube.com/watch?v=streamChap12',
  title: 'Truyện Tập Ảo Stream',
  author: 'Tác giả Stream',
  categoryId: 1,
  thumbnailUrl: 'https://i.ytimg.com/vi/streamChap12/hqdefault.jpg',
  totalDurationSeconds: 7200,
  totalEpisodes: 2,
  episodes: [
    {
      id: 5001,
      episodeNumber: 1,
      title: 'Tập 1: Mở đầu',
      startSeconds: 0,
      endSeconds: 3600,
      duration: 3600,
    },
    {
      id: 5002,
      episodeNumber: 2,
      title: 'Tập 2: Cao trào',
      startSeconds: 3600,
      endSeconds: 7200,
      duration: 3600,
    },
  ],
};

describe('playerStore in Direct Audio Stream mode', () => {
  let audioEl: HTMLAudioElement;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    usePlayerStore.getState().reset();
    audioEl = document.createElement('audio');
    audioEl.load = vi.fn();
    audioEl.play = vi.fn().mockResolvedValue(undefined);
    audioEl.pause = vi.fn();
    usePlayerStore.getState().setAudioElement(audioEl);
    usePlayerStore.getState().setEngineMode('stream');
  });

  afterEach(() => {
    usePlayerStore.getState().setAudioElement(null);
    vi.restoreAllMocks();
  });

  it('plays via HtmlAudioEngine, seeks, and updates native playbackRate immediately', async () => {
    vi.spyOn(audioService, 'getStreamToken').mockResolvedValue({
      streamToken: 'tok_store',
      videoId: 'streamChap12',
      streamPath: '/stream/streamChap12?st=tok_store',
      streamUrl: 'https://stream.example.com/stream/streamChap12?st=tok_store',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    usePlayerStore.getState().play(multiChapterAudio, multiChapterAudio.episodes![0], 45);
    await Promise.resolve();

    const state = usePlayerStore.getState();
    expect(state.activeEngine).toBe('stream');
    expect(state.isPlaying).toBe(true);
    expect(state.rateSyncStatus).toBe('synced');

    usePlayerStore.getState().setPlaybackRate(1.75);
    expect(usePlayerStore.getState().playbackRate).toBe(1.75);
    expect(usePlayerStore.getState().confirmedPlaybackRate).toBe(1.75);
    expect(usePlayerStore.getState().rateSyncStatus).toBe('synced');
    expect(audioEl.playbackRate).toBe(1.75);

    usePlayerStore.getState().seekTo(500);
    expect(audioEl.currentTime).toBe(500);
    expect(usePlayerStore.getState().currentTime).toBe(500);
  });

  it('seamlessly advances virtual chapter on timeupdate without calling pause or reloading src', async () => {
    vi.spyOn(audioService, 'getStreamToken').mockResolvedValue({
      streamToken: 'tok_adv',
      videoId: 'streamChap12',
      streamPath: '/stream/streamChap12?st=tok_adv',
      streamUrl: 'https://stream.example.com/stream/streamChap12?st=tok_adv',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    usePlayerStore.getState().play(multiChapterAudio, multiChapterAudio.episodes![0], 0);
    await Promise.resolve();
    audioEl.dispatchEvent(new Event('loadedmetadata'));
    vi.clearAllMocks();

    // Simulate reaching endSeconds (3600) of Episode 1
    audioEl.currentTime = 3601;
    audioEl.dispatchEvent(new Event('timeupdate'));

    const state = usePlayerStore.getState();
    expect(state.currentEpisode?.id).toBe(5002);
    expect(state.isPlaying).toBe(true);
    expect(audioEl.pause).not.toHaveBeenCalled();
    expect(audioEl.load).not.toHaveBeenCalled();
    expect(htmlAudioEngine.getTime()).toBe(3601);
  });

  it('automatically falls back to YouTube engine if stream fails fatally', async () => {
    vi.spyOn(audioService, 'getStreamToken').mockRejectedValue({
      status: 502,
      message: 'yt-dlp blocked',
    });

    usePlayerStore.getState().play(multiChapterAudio, multiChapterAudio.episodes![0], 10);
    await new Promise((r) => setTimeout(r, 10));

    expect(usePlayerStore.getState().activeEngine).toBe('youtube');
  });

  it('does NOT jump Audio B to Episode 2 when switching from Audio A with stale stream events', async () => {
    const secondAudio: AudioItem = {
      ...multiChapterAudio,
      id: 600,
      youtubeVideoId: 'audioBStream',
      youtubeUrl: 'https://youtube.com/watch?v=audioBStream',
      title: 'Truyện B - Cần Bắt Đầu Từ Tập 1',
      episodes: [
        {
          id: 6001,
          episodeNumber: 1,
          title: 'Tập 1',
          startSeconds: 0,
          endSeconds: 3600,
          duration: 3600,
        },
        {
          id: 6002,
          episodeNumber: 2,
          title: 'Tập 2',
          startSeconds: 3600,
          endSeconds: 7200,
          duration: 3600,
        },
      ],
    };

    let resolveSecondToken: ((v: any) => void) | null = null;
    vi.spyOn(audioService, 'getStreamToken').mockImplementation((audioId) => {
      if (Number(audioId) === 500) {
        return Promise.resolve({
          streamToken: 'tok_a',
          videoId: 'streamChap12',
          streamPath: '/stream/streamChap12?st=tok_a',
          streamUrl: 'https://stream.example.com/stream/streamChap12?st=tok_a',
          expiresAt: '2026-12-01T00:00:00Z',
        });
      }
      return new Promise((resolve) => {
        resolveSecondToken = resolve;
      });
    });

    // 1. Play Audio A deeply past 3600s (so if leaked into Audio B Ep 1 it would trigger Ep 2)
    usePlayerStore.getState().play(multiChapterAudio, multiChapterAudio.episodes![1], 1400);
    await Promise.resolve();
    audioEl.currentTime = 5000;
    audioEl.dispatchEvent(new Event('loadedmetadata'));
    expect(htmlAudioEngine.getLoadedVideoId()).toBe('streamChap12');

    // 2. Switch to Audio B while Audio B token fetch is still pending & stale Audio A events fire
    usePlayerStore.getState().play(secondAudio, secondAudio.episodes![0], 0);
    audioEl.currentTime = 5000;
    audioEl.dispatchEvent(new Event('timeupdate'));
    audioEl.dispatchEvent(new Event('ended'));

    let state = usePlayerStore.getState();
    expect(state.currentAudio?.id).toBe(600);
    expect(state.currentEpisode?.episodeNumber).toBe(1);
    expect(state.currentEpisode?.id).toBe(6001);

    // 3. Resolve Audio B stream token and dispatch loadedmetadata -> resets currentTime to 0, stays on Ep 1
    resolveSecondToken!({
      streamToken: 'tok_b',
      videoId: 'audioBStream',
      streamPath: '/stream/audioBStream?st=tok_b',
      streamUrl: 'https://stream.example.com/stream/audioBStream?st=tok_b',
      expiresAt: '2026-12-01T00:00:00Z',
    });
    await Promise.resolve();
    await Promise.resolve();
    audioEl.dispatchEvent(new Event('loadedmetadata'));

    state = usePlayerStore.getState();
    expect(state.currentAudio?.id).toBe(600);
    expect(state.currentEpisode?.episodeNumber).toBe(1);
    expect(state.currentEpisode?.id).toBe(6001);
    expect(audioEl.currentTime).toBe(0);
  });

  it('does NOT jump Audio B to Episode 2 in YouTube mode when ytPlayerInstance still reports Audio A', () => {
    vi.useFakeTimers();
    try {
      const audioB: AudioItem = {
        ...multiChapterAudio,
        id: 700,
        youtubeVideoId: 'ytVideoBBBB',
        title: 'Truyện B YouTube',
        episodes: [
          {
            id: 7001,
            episodeNumber: 1,
            title: 'Tập 1',
            startSeconds: 0,
            endSeconds: 3600,
            duration: 3600,
          },
          {
            id: 7002,
            episodeNumber: 2,
            title: 'Tập 2',
            startSeconds: 3600,
            endSeconds: 7200,
            duration: 3600,
          },
        ],
      };

      const fakeYtPlayer = {
        loadVideoById: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        seekTo: vi.fn(),
        getCurrentTime: vi.fn().mockReturnValue(5000),
        getPlaybackRate: vi.fn().mockReturnValue(1),
        getPlayerState: vi.fn().mockReturnValue(1),
        getVideoData: vi.fn().mockReturnValue({ video_id: 'streamChap12' }),
      };

      usePlayerStore.getState().setAudioElement(null);
      usePlayerStore.getState().setYtInstance(fakeYtPlayer);

      usePlayerStore.getState().play(multiChapterAudio, multiChapterAudio.episodes![1], 1400);
      usePlayerStore.getState().play(audioB, audioB.episodes![0], 0);

      // Advance poll interval while fakeYtPlayer.getVideoData() still returns Audio A ('streamChap12')
      vi.advanceTimersByTime(3200);

      const state = usePlayerStore.getState();
      expect(state.currentAudio?.id).toBe(700);
      expect(state.currentEpisode?.episodeNumber).toBe(1);
      expect(state.currentEpisode?.id).toBe(7001);
    } finally {
      vi.useRealTimers();
    }
  });
});
