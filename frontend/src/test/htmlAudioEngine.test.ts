import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HtmlAudioEngine } from '@/lib/audio/HtmlAudioEngine';
import { audioService } from '@/services/audioService';

describe('HtmlAudioEngine', () => {
  let engine: HtmlAudioEngine;
  let audioEl: HTMLAudioElement;

  beforeEach(() => {
    sessionStorage.clear();
    engine = new HtmlAudioEngine((audioId, episodeId, episodeNumber) =>
      audioService.getStreamToken(audioId, episodeId, episodeNumber)
    );
    audioEl = document.createElement('audio');
    audioEl.load = vi.fn();
    audioEl.play = vi.fn().mockResolvedValue(undefined);
    audioEl.pause = vi.fn();
    engine.attachElement(audioEl);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    engine.destroy();
  });

  it('loads stream URL from getStreamToken and applies startSeconds + playbackRate on loadedmetadata', async () => {
    const spyToken = vi.spyOn(audioService, 'getStreamToken').mockResolvedValue({
      streamToken: 'tok_abc',
      videoId: 'vid_1234567',
      streamPath: '/stream/vid_1234567?st=tok_abc',
      streamUrl: 'https://stream.example.com/stream/vid_1234567?st=tok_abc',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    await engine.load({
      audioId: 10,
      videoId: 'vid_1234567',
      episodeId: 101,
      episodeNumber: 1,
      startSeconds: 320,
      autoplay: true,
      playbackRate: 1.5,
    });

    expect(spyToken).toHaveBeenCalledWith(10, 101, 1);
    expect(audioEl.src).toBe('https://stream.example.com/stream/vid_1234567?st=tok_abc');
    expect(audioEl.load).toHaveBeenCalledTimes(1);

    audioEl.dispatchEvent(new Event('loadedmetadata'));
    expect(audioEl.currentTime).toBe(320);
    expect(audioEl.playbackRate).toBe(1.5);
    expect(audioEl.play).toHaveBeenCalledTimes(1);
  });

  it('switches virtual chapters on the same videoId WITHOUT changing src', async () => {
    const spyToken = vi.spyOn(audioService, 'getStreamToken').mockResolvedValue({
      streamToken: 'tok_same',
      videoId: 'vid_same123',
      streamPath: '/stream/vid_same123?st=tok_same',
      streamUrl: 'https://stream.example.com/stream/vid_same123?st=tok_same',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    await engine.load({
      audioId: 20,
      videoId: 'vid_same123',
      episodeId: 1,
      episodeNumber: 1,
      startSeconds: 0,
      autoplay: true,
      playbackRate: 1.25,
    });
    audioEl.dispatchEvent(new Event('loadedmetadata'));

    // Load chapter 2 on the same videoId
    await engine.load({
      audioId: 20,
      videoId: 'vid_same123',
      episodeId: 2,
      episodeNumber: 2,
      startSeconds: 3600,
      autoplay: true,
      playbackRate: 1.25,
    });

    expect(spyToken).toHaveBeenCalledTimes(1);
    expect(audioEl.load).toHaveBeenCalledTimes(1);
    expect(audioEl.currentTime).toBe(3600);
  });

  it('recovers from media error with fresh token and falls back to YouTube after max retries', async () => {
    vi.useFakeTimers();
    const spyToken = vi.spyOn(audioService, 'getStreamToken').mockResolvedValue({
      streamToken: 'tok_retry',
      videoId: 'vid_err1234',
      streamPath: '/stream/vid_err1234?st=tok_retry',
      streamUrl: 'https://stream.example.com/stream/vid_err1234?st=tok_retry',
      expiresAt: '2026-12-01T00:00:00Z',
    });

    const errors: Array<{ fatal: boolean; shouldFallbackToYouTube: boolean }> = [];
    engine.on('error', (e) => errors.push(e));

    await engine.load({
      audioId: 30,
      videoId: 'vid_err1234',
      episodeId: 1,
      startSeconds: 120,
      autoplay: true,
      playbackRate: 1.0,
    });
    audioEl.dispatchEvent(new Event('loadedmetadata'));
    audioEl.currentTime = 450;

    // Trigger 1st error -> retry #1 after 1000ms
    audioEl.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(spyToken).toHaveBeenCalledTimes(2);
    expect(audioEl.src).toContain('retry=');

    // Trigger 2nd error -> retry #2 after 2000ms
    audioEl.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(spyToken).toHaveBeenCalledTimes(3);

    // Trigger 3rd error -> retry #3 after 4000ms
    audioEl.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(4000);
    expect(spyToken).toHaveBeenCalledTimes(4);

    // 4th error exceeds MAX_STREAM_RETRIES -> emits fatal YouTube fallback
    audioEl.dispatchEvent(new Event('error'));
    expect(errors).toHaveLength(1);
    expect(errors[0].fatal).toBe(true);
    expect(errors[0].shouldFallbackToYouTube).toBe(true);
  });
});
