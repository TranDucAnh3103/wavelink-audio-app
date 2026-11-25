import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { usePlayerStore, setCurrentPlayerUserId } from '@/stores/playerStore';
import { audioService } from '@/services/audioService';
import { localDb } from '@/services/localDb';
import { queryClient } from '@/lib/queryClient';
import { AudioItem, User } from '@/types';
import { isBackgroundAudioRunning } from '@/lib/backgroundAudioKeeper';

describe('Three Issues Verification (VIP Guest Access, Clean Logout, Background Audio & Sleep Timer)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    queryClient.clear();
    usePlayerStore.getState().reset();
    useAuthStore.setState({ user: null, token: null });
  });

  describe('Issue 1: Guest Access to VIP Audio & Episode 1 Free', () => {
    it('allows guest to access VIP audio and listen to Episode 1 for free, while Episode 2+ is locked', async () => {
      // 1. Set current user as Guest
      const guestUser: User = { id: 0, username: 'Khách Nghe Thử', role: 'GUEST', isGuest: true };
      useAuthStore.setState({ user: guestUser });

      // 2. Mock VIP Audio with 2 episodes
      const vipAudio: AudioItem = {
        id: 5555,
        youtubeVideoId: 'viptest5555',
        youtubeUrl: 'https://www.youtube.com/watch?v=viptest5555',
        title: 'Truyện Tiên Hiệp VIP',
        author: 'Tác giả VIP',
        categoryId: 1,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        totalDurationSeconds: 28800,
        totalEpisodes: 2,
        isVIPOnly: true,
        isVipOnly: true,
        episodes: [
          {
            id: 1,
            audioId: 5555,
            episodeNumber: 1,
            title: 'Tập 1: Mở Đầu',
            startSeconds: 0,
            endSeconds: 14400,
            duration: 14400,
            isVip: true,
          },
          {
            id: 2,
            audioId: 5555,
            episodeNumber: 2,
            title: 'Tập 2: Đột Phá',
            startSeconds: 14400,
            endSeconds: 28800,
            duration: 14400,
            isVip: true,
          },
        ],
      };

      const db = localDb.get();
      db.audios = [vipAudio];
      localDb.save();

      // 3. Guest loads VIP Audio
      const loadedAudio = await audioService.getAudioById(5555, false);
      expect(loadedAudio).toBeDefined();
      expect(loadedAudio?.id).toBe(5555);
      expect(loadedAudio?.episodes).toHaveLength(2);

      // Tập 1: Luôn FREE (isLocked: false)
      expect(loadedAudio?.episodes![0].episodeNumber).toBe(1);
      expect(loadedAudio?.episodes![0].isLocked).toBe(false);

      // Tập 2: Bị khóa VIP (isLocked: true)
      expect(loadedAudio?.episodes![1].episodeNumber).toBe(2);
      expect(loadedAudio?.episodes![1].isLocked).toBe(true);
    });

    it('allows guest to play episode 1 free, but blocks playing episode 2 and redirects to login', () => {
      const guestUser: User = { id: 0, username: 'Khách Nghe Thử', role: 'GUEST', isGuest: true };
      useAuthStore.setState({ user: guestUser });

      const vipAudio: AudioItem = {
        id: 5555,
        youtubeVideoId: 'viptest5555',
        youtubeUrl: 'https://www.youtube.com/watch?v=viptest5555',
        title: 'Truyện Tiên Hiệp VIP',
        author: 'Tác giả VIP',
        categoryId: 1,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        totalDurationSeconds: 28800,
        totalEpisodes: 2,
        isVIPOnly: true,
        isVipOnly: true,
        episodes: [
          {
            id: 1,
            audioId: 5555,
            episodeNumber: 1,
            title: 'Tập 1: Mở Đầu',
            startSeconds: 0,
            endSeconds: 14400,
            duration: 14400,
            isVip: true,
            isLocked: false,
          },
          {
            id: 2,
            audioId: 5555,
            episodeNumber: 2,
            title: 'Tập 2: Đột Phá',
            startSeconds: 14400,
            endSeconds: 28800,
            duration: 14400,
            isVip: true,
            isLocked: true,
          },
        ],
      };

      // Play episode 1: Succeeded!
      usePlayerStore.getState().play(vipAudio, vipAudio.episodes![0]);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
      expect(usePlayerStore.getState().currentEpisode?.episodeNumber).toBe(1);

      // Play episode 2: Blocked!
      usePlayerStore.getState().play(vipAudio, vipAudio.episodes![1]);
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(window.location.hash).toBe('#/login');
    });
  });

  describe('Issue 2: Clean Logout & Audio Termination & Cache Wipe', () => {
    it('stops audio playback, resets playerStore, and clears web cache when user logs out', async () => {
      // 1. User A logs in
      const userA: User = { id: 101, username: 'UserA', role: 'USER', isGuest: false };
      useAuthStore.setState({ user: userA, token: 'token_user_a' });
      localStorage.setItem('auth_token', 'token_user_a');
      localStorage.setItem('auth_user', JSON.stringify(userA));
      sessionStorage.setItem('temp_data', 'userA_secret');

      const sampleAudio: AudioItem = {
        id: 1234,
        youtubeVideoId: 'video1234',
        youtubeUrl: 'https://www.youtube.com/watch?v=video1234',
        title: 'Truyện Đang Nghe Của User A',
        author: 'Tác giả A',
        categoryId: 1,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        totalDurationSeconds: 14400,
        totalEpisodes: 1,
      };

      // User A plays audio
      usePlayerStore.getState().play(sampleAudio);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
      expect(usePlayerStore.getState().currentAudio?.id).toBe(1234);

      // 2. User A logs out
      await useAuthStore.getState().logout();

      // Audio must be stopped!
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      // PlayerStore must be reset (no currentAudio -> MiniPlayer at nav disappears!)
      expect(usePlayerStore.getState().currentAudio).toBeNull();
      expect(usePlayerStore.getState().currentEpisode).toBeNull();
      expect(usePlayerStore.getState().currentTime).toBe(0);

      // Web cache & storage must be clean
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(sessionStorage.getItem('temp_data')).toBeNull();

      // 3. User B logs in
      const userB: User = { id: 202, username: 'UserB', role: 'USER', isGuest: false };
      useAuthStore.setState({ user: userB, token: 'token_user_b' });

      // User B should NOT have User A's audio lingering in player
      expect(usePlayerStore.getState().currentAudio).toBeNull();
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });
  });

  describe('Issue 3: Background Audio Playback & Background Sleep Timer', () => {
    it('tracks sleep timer end timestamp and stops playback when timer expires', () => {
      vi.useFakeTimers();

      const sampleAudio: AudioItem = {
        id: 8888,
        youtubeVideoId: 'bgvideo8888',
        youtubeUrl: 'https://www.youtube.com/watch?v=bgvideo8888',
        title: 'Truyện Chạy Nền',
        author: 'Tác giả Nền',
        categoryId: 1,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        totalDurationSeconds: 14400,
        totalEpisodes: 1,
      };

      usePlayerStore.getState().play(sampleAudio);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
      expect(usePlayerStore.getState().isExplicitlyPaused).toBe(false);

      // Set sleep timer for 15 minutes
      usePlayerStore.getState().setSleepTimer(15);
      expect(usePlayerStore.getState().sleepTimerMinutes).toBe(15);
      expect(usePlayerStore.getState().sleepTimerEndTimestamp).toBeGreaterThan(Date.now());
      expect(localStorage.getItem('wavelink_sleep_timer_end')).toBeDefined();

      // Fast-forward 15 minutes
      vi.advanceTimersByTime(15 * 60 * 1000);

      // Audio must be automatically stopped!
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(usePlayerStore.getState().sleepTimerMinutes).toBeNull();
      expect(usePlayerStore.getState().sleepTimerEndTimestamp).toBeNull();
      expect(localStorage.getItem('wavelink_sleep_timer_end')).toBeNull();

      vi.useRealTimers();
    });

    it('maintains isExplicitlyPaused flag to distinguish intentional pause from background interruptions', () => {
      const sampleAudio: AudioItem = {
        id: 9999,
        youtubeVideoId: 'bgvideo9999',
        youtubeUrl: 'https://www.youtube.com/watch?v=bgvideo9999',
        title: 'Truyện Test Pause',
        author: 'Tác giả',
        categoryId: 1,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        totalDurationSeconds: 14400,
        totalEpisodes: 1,
      };

      usePlayerStore.getState().play(sampleAudio);
      expect(usePlayerStore.getState().isExplicitlyPaused).toBe(false);

      usePlayerStore.getState().pause();
      expect(usePlayerStore.getState().isExplicitlyPaused).toBe(true);

      usePlayerStore.getState().resume();
      expect(usePlayerStore.getState().isExplicitlyPaused).toBe(false);
    });
  });

  describe('Issue 4: QuotaExceededError Resilience on Import YouTube & LocalDb Save', () => {
    it('does not throw QuotaExceededError when localStorage is full during localDb.save() or audioService.importYouTube()', async () => {
      const adminUser: User = { id: 1, username: 'Admin', role: 'ADMIN', isGuest: false };
      useAuthStore.setState({ user: adminUser });

      const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        const err = new Error(
          "QuotaExceededError: Failed to execute 'setItem' on 'Storage': Setting the value of 'audio_library_db' exceeded the quota."
        );
        err.name = 'QuotaExceededError';
        throw err;
      });

      try {
        expect(() => localDb.save()).not.toThrow();

        const result = await audioService.importYouTube(
          {
            url: 'https://youtu.be/x_RzkqR_-JY',
            categoryId: 1,
            tags: ['Mạt Thế'],
            durationSeconds: 36000,
            blockSizeSeconds: 14400,
          },
          false,
          1
        );

        expect(result.duplicate).toBe(false);
        expect(result.audio.youtubeVideoId).toBe('x_RzkqR_-JY');
      } finally {
        spy.mockRestore();
      }
    });
  });
});
