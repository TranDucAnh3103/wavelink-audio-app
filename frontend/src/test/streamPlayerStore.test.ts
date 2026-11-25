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
});
