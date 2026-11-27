import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { axiosClient } from '@/lib/axiosClient';
import { audioService } from '@/services/audioService';
import { guestSessionService } from '@/services/guestSessionService';
import { progressService } from '@/services/progressService';
import { saveLocalProgressSnapshot } from '@/lib/progressSnapshot';
import { usePlayerStore, htmlAudioEngine } from '@/stores/playerStore';
import { HtmlAudioEngine } from '@/lib/audio/HtmlAudioEngine';
import { AudioItem } from '@/types';

const sampleAudio: AudioItem = {
  id: 77,
  youtubeVideoId: 'bgTestVid01',
  youtubeUrl: 'https://www.youtube.com/watch?v=bgTestVid01',
  title: 'Phàm Nhân Tu Tiên Audio',
  author: 'Vong Ngữ',
  categoryId: 1,
  thumbnailUrl: 'https://example.com/thumb.jpg',
  totalDurationSeconds: 28800,
  totalEpisodes: 2,
  lastPositionSeconds: 120,
  progressPercent: 1,
  currentEpisodeId: 701,
  currentEpisodeNumber: 1,
  currentEpisodeTitle: 'Tập 1',
  episodes: [
    {
      id: 701,
      audioId: 77,
      episodeNumber: 1,
      title: 'Tập 1',
      startSeconds: 0,
      endSeconds: 14400,
      duration: 14400,
      positionSeconds: 120,
      progressPercent: 1,
      completed: false,
    },
    {
      id: 702,
      audioId: 77,
      episodeNumber: 2,
      title: 'Tập 2',
      startSeconds: 14400,
      endSeconds: 28800,
      duration: 14400,
      positionSeconds: 0,
      progressPercent: 0,
      completed: false,
    },
  ],
};

describe('Background Audio Persistence & Progress Durability', () => {
  const origHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const origOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    usePlayerStore.getState().reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    usePlayerStore.getState().reset();
    if (origHidden) {
      Object.defineProperty(Document.prototype, 'hidden', origHidden);
    }
    if (origOnLine) {
      Object.defineProperty(Navigator.prototype, 'onLine', origOnLine);
    }
  });

  it('reconciles stale server position with newer local snapshot and backfills server', async () => {
    localStorage.setItem('auth_token', 'test-jwt-token');
    saveLocalProgressSnapshot({
      audioId: 77,
      episodeId: 702,
      episodeNumber: 2,
      positionSeconds: 2450,
      duration: 14400,
      progressPercent: 17,
      updatedAt: Date.now(),
    });

    vi.spyOn(axiosClient, 'get').mockResolvedValueOnce({
      data: { success: true, data: structuredClone(sampleAudio) },
    } as never);
    const updateSpy = vi.spyOn(progressService, 'updateProgress').mockResolvedValue();

    const loaded = await audioService.getAudioById(77, true);
    expect(loaded).not.toBeNull();
    expect(loaded?.currentEpisodeId).toBe(702);
    expect(loaded?.currentEpisodeNumber).toBe(2);
    expect(loaded?.lastPositionSeconds).toBe(2450);
    expect(loaded?.episodes?.[1].positionSeconds).toBe(2450);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        audioId: 77,
        episodeId: 702,
        positionSeconds: 2450,
      }),
      true
    );
  });

  it('captures live HTML5 <audio> playback position even while document.hidden is true', () => {
    localStorage.setItem('auth_token', 'test-jwt-token');
    const updateSpy = vi.spyOn(progressService, 'updateProgress').mockResolvedValue();

    vi.spyOn(htmlAudioEngine, 'isReady').mockReturnValue(true);
    vi.spyOn(htmlAudioEngine, 'load').mockResolvedValue();
    vi.spyOn(htmlAudioEngine, 'pause').mockImplementation(() => {});
    vi.spyOn(htmlAudioEngine, 'getLoadedVideoId').mockReturnValue('bgTestVid01');
    const getTimeSpy = vi.spyOn(htmlAudioEngine, 'getTime').mockReturnValue(120);

    usePlayerStore.setState({ activeEngine: 'stream' });
    usePlayerStore.getState().play(structuredClone(sampleAudio), sampleAudio.episodes![0], 120);

    // Simulate OS backgrounding tab/app while audio plays for 15 minutes
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    getTimeSpy.mockReturnValue(1020);

    // Trigger background pause (e.g. Lock Screen pause or app kill freeze)
    usePlayerStore.getState().pause();

    expect(usePlayerStore.getState().currentTime).toBe(1020);
    expect(updateSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audioId: 77,
        episodeId: 701,
        positionSeconds: 1020,
      })
    );
  });

  it('restores last playback session into MiniPlayer state after simulated OS process kill', () => {
    saveLocalProgressSnapshot({
      audioId: 77,
      episodeId: 701,
      episodeNumber: 1,
      positionSeconds: 1850,
      duration: 14400,
      progressPercent: 13,
      updatedAt: Date.now() + 1000,
    });

    vi.spyOn(htmlAudioEngine, 'isReady').mockReturnValue(true);
    vi.spyOn(htmlAudioEngine, 'load').mockResolvedValue();
    usePlayerStore.setState({ activeEngine: 'stream' });
    usePlayerStore.getState().play(structuredClone(sampleAudio), sampleAudio.episodes![0], 900);

    // Update snapshot ahead of session write
    saveLocalProgressSnapshot({
      audioId: 77,
      episodeId: 701,
      episodeNumber: 1,
      positionSeconds: 1850,
      duration: 14400,
      progressPercent: 13,
      updatedAt: Date.now() + 5000,
    });

    // Simulate fresh cold start in new memory (without calling user-initiated close())
    usePlayerStore.setState({
      currentAudio: null,
      currentEpisode: null,
      currentTime: 0,
      isPlaying: false,
      isExplicitlyPaused: true,
    });

    usePlayerStore.getState().hydrateLastPlaybackSession();

    const restored = usePlayerStore.getState();
    expect(restored.currentAudio?.id).toBe(77);
    expect(restored.currentEpisode?.id).toBe(701);
    expect(restored.currentTime).toBe(1850);
    expect(restored.isPlaying).toBe(false);
  });

  it('retains guest listening progress in localStorage even when sessionStorage is wiped by OS kill', () => {
    guestSessionService.saveGuestProgress({
      audioId: 88,
      episodeId: 801,
      positionSeconds: 3120,
      progressPercent: 45,
      completed: false,
    });

    // Simulate Android OS killing WebView/browser process (wiping sessionStorage)
    sessionStorage.clear();

    const recovered = guestSessionService.getGuestProgressForAudio(88);
    expect(recovered).toHaveLength(1);
    expect(recovered[0].positionSeconds).toBe(3120);
  });

  it('waits for online recovery in HtmlAudioEngine during offline background drop instead of falling back to YouTube', async () => {
    const tokenFetcher = vi.fn().mockResolvedValue({
      streamToken: 'tok-123',
      streamUrl: '/stream/vidOffline?st=tok-123',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const engine = new HtmlAudioEngine(tokenFetcher);
    const el = document.createElement('audio');
    Object.defineProperty(el, 'readyState', { configurable: true, get: () => 0 });
    el.play = vi.fn().mockResolvedValue(undefined);
    el.pause = vi.fn();
    el.load = vi.fn();
    engine.attachElement(el);

    const errorSpy = vi.fn();
    engine.on('error', errorSpy);

    await engine.load({
      audioId: 99,
      videoId: 'vidOffline',
      episodeId: 991,
      episodeNumber: 1,
      startSeconds: 500,
      autoplay: true,
      playbackRate: 1.5,
    });

    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    el.dispatchEvent(new Event('error'));

    // Must NOT emit fatal YouTube fallback while offline
    expect(errorSpy).not.toHaveBeenCalled();

    // Restore network connectivity -> automatically re-requests fresh stream token and reloads audio
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(() => {
      expect(tokenFetcher).toHaveBeenCalledTimes(2);
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
