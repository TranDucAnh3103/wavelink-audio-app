import { describe, it, expect, beforeEach, vi } from 'vitest';
import { guestSessionService } from '@/services/guestSessionService';
import { progressService } from '@/services/progressService';
import { historyService } from '@/services/historyService';
import { axiosClient } from '@/lib/axiosClient';
import { AudioItem, Episode } from '@/types';

describe('Guest Session Service & Storage Flow', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. saveGuestProgress stores progress in sessionStorage without DB calls', () => {
    guestSessionService.saveGuestProgress({
      audioId: 10,
      episodeId: 101,
      positionSeconds: 1500,
      progressPercent: 25.5,
      completed: false,
    });

    const stored = guestSessionService.getAllGuestProgress();
    expect(stored.length).toBe(1);
    expect(stored[0].audioId).toBe(10);
    expect(stored[0].episodeId).toBe(101);
    expect(stored[0].positionSeconds).toBe(1500);
    expect(stored[0].progressPercent).toBe(26);
    expect(stored[0].completed).toBe(false);
  });

  it('2. applyGuestProgressToAudio retains progress on F5 page reload', () => {
    // Lưu tiến trình của khách vào sessionStorage (như trước khi F5)
    guestSessionService.saveGuestProgress({
      audioId: 1,
      episodeId: 101,
      positionSeconds: 2400,
      progressPercent: 40,
      completed: false,
    });

    // Audio mẫu trả về từ API Backend (chưa có tiến trình vì khách chưa đăng nhập)
    const backendAudio: AudioItem = {
      id: 1,
      title: 'Đấu Phá Thương Khung',
      author: 'Thiên Tằm Thổ Đậu',
      youtubeVideoId: 'dQw4w9WgXcQ',
      youtubeUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      categoryId: 1,
      thumbnailUrl: 'https://example.com/thumb.jpg',
      totalDurationSeconds: 14400,
      totalEpisodes: 2,
      lastPositionSeconds: 0,
      progressPercent: 0,
      episodes: [
        {
          id: 101,
          audioId: 1,
          episodeNumber: 1,
          title: 'Tập 1',
          startSeconds: 0,
          endSeconds: 7200,
          duration: 7200,
          positionSeconds: 0,
          progressPercent: 0,
          completed: false,
        },
        {
          id: 102,
          audioId: 1,
          episodeNumber: 2,
          title: 'Tập 2',
          startSeconds: 7200,
          endSeconds: 14400,
          duration: 7200,
          positionSeconds: 0,
          progressPercent: 0,
          completed: false,
        },
      ],
    };

    // Áp dụng tiến trình từ session (mô phỏng sau khi F5 tải lại trang)
    const enriched = guestSessionService.applyGuestProgressToAudio(backendAudio);

    expect(enriched.lastPositionSeconds).toBe(2400);
    expect(enriched.progressPercent).toBe(40);
    expect(enriched.currentEpisodeId).toBe(101);
    expect(enriched.episodes?.[0].positionSeconds).toBe(2400);
    expect(enriched.episodes?.[0].progressPercent).toBe(40);
  });

  it('3. saveGuestHistory and getGuestHistory maintain consolidated history in session', () => {
    const audio: AudioItem = {
      id: 5,
      title: 'Vũ Động Càn Khôn',
      author: 'Thiên Tằm Thổ Đậu',
      youtubeVideoId: 'xyz123',
      youtubeUrl: 'https://youtube.com/watch?v=xyz123',
      categoryId: 1,
      totalEpisodes: 1,
      totalDurationSeconds: 7200,
      thumbnailUrl: 'https://example.com/thumb.jpg',
    };
    const episode: Episode = {
      id: 501,
      audioId: 5,
      episodeNumber: 1,
      title: 'Tập 1 (Khởi đầu)',
      startSeconds: 0,
      endSeconds: 7200,
      positionSeconds: 300,
      progressPercent: 10,
    };

    guestSessionService.saveGuestHistory({ audioId: 5, episodeId: 501, durationListened: 300 }, audio, episode);

    const history = guestSessionService.getGuestHistory();
    expect(history.length).toBe(1);
    expect(history[0].audioId).toBe(5);
    expect(history[0].title).toBe('Vũ Động Càn Khôn');
    expect(history[0].currentEpisodeTitle).toBe('Tập 1 (Khởi đầu)');
    expect(history[0].durationListened).toBe(300);
  });

  it('4. progressService does NOT call backend PUT /progress when unauthenticated (guest)', async () => {
    const putSpy = vi.spyOn(axiosClient, 'put').mockResolvedValue({ data: { success: true } });

    // Không có auth_token trong localStorage
    await progressService.updateProgress({
      audioId: 8,
      episodeId: 801,
      positionSeconds: 600,
      progressPercent: 15,
    });

    // Đảm bảo KHÔNG gửi request lên backend DB
    expect(putSpy).not.toHaveBeenCalled();

    // Nhưng tiến trình vẫn được lưu trong sessionStorage
    const stored = guestSessionService.getGuestProgressForAudio(8);
    expect(stored.length).toBe(1);
    expect(stored[0].positionSeconds).toBe(600);
  });

  it('5. historyService does NOT call backend POST /history when unauthenticated (guest)', async () => {
    const postSpy = vi.spyOn(axiosClient, 'post').mockResolvedValue({ data: { success: true } });

    await historyService.recordHistory({
      audioId: 9,
      episodeId: 901,
      durationListened: 120,
    });

    // Đảm bảo KHÔNG gửi request lên backend DB
    expect(postSpy).not.toHaveBeenCalled();

    // Nhưng lịch sử được lưu trong sessionStorage
    const history = guestSessionService.getGuestHistory();
    expect(history.length).toBe(1);
    expect(history[0].audioId).toBe(9);
  });

  it('6. migrateGuestSessionToUser sends session data to DB and clears sessionStorage', async () => {
    // 1. Giả lập khách đã nghe 1 tập và tạo 1 lịch sử
    guestSessionService.saveGuestProgress({
      audioId: 2,
      episodeId: 201,
      positionSeconds: 1800,
      progressPercent: 30,
      completed: false,
    });
    guestSessionService.saveGuestHistory(
      { audioId: 2, episodeId: 201, durationListened: 1800 },
      {
        id: 2,
        title: 'Phàm Nhân Tu Tiên',
        totalDurationSeconds: 6000,
        youtubeVideoId: 'v123',
        youtubeUrl: 'https://youtube.com/watch?v=v123',
        author: 'Vong Ngữ',
        categoryId: 1,
        totalEpisodes: 1,
        thumbnailUrl: 'https://example.com/thumb.jpg',
      },
      { id: 201, audioId: 2, episodeNumber: 1, title: 'Tập 1', startSeconds: 0, endSeconds: 6000 }
    );

    expect(guestSessionService.hasGuestData()).toBe(true);

    const putSpy = vi.spyOn(axiosClient, 'put').mockResolvedValue({ data: { success: true } });
    const postSpy = vi.spyOn(axiosClient, 'post').mockResolvedValue({ data: { success: true } });

    // 2. Chuyển đổi dữ liệu guest sang user
    const result = await guestSessionService.migrateGuestSessionToUser();

    // Đảm bảo đã gửi lên backend DB
    expect(putSpy).toHaveBeenCalled();
    expect(postSpy).toHaveBeenCalled();
    expect(result.progressCount).toBeGreaterThanOrEqual(1);
    expect(result.historyCount).toBeGreaterThanOrEqual(1);

    // 3. Đảm bảo sessionStorage của khách đã được xóa sạch
    expect(guestSessionService.hasGuestData()).toBe(false);
    expect(guestSessionService.getAllGuestProgress().length).toBe(0);
    expect(guestSessionService.getGuestHistory().length).toBe(0);
  });

  it('7. saveGuestHistory correctly preserves rich audio metadata, durationListened & totalDurationListened', () => {
    guestSessionService.saveGuestHistory({
      audioId: 10,
      episodeId: 1001,
      durationListened: 125,
      totalDurationListened: 450,
      positionSeconds: 240,
      progressPercent: 20,
      audio: {
        id: 10,
        title: 'Mục Thần Ký',
        thumbnailUrl: 'https://example.com/mucthanky.jpg',
        author: 'Trạch Trư',
        youtubeVideoId: 'mtk123',
        youtubeUrl: 'https://youtube.com/watch?v=mtk123',
        categoryId: 1,
        totalEpisodes: 5,
        totalDurationSeconds: 12000,
      },
      episode: {
        id: 1001,
        audioId: 10,
        episodeNumber: 2,
        title: 'Tập 2: Tàn Lão Thôn',
        startSeconds: 2400,
        endSeconds: 4800,
        duration: 2400,
      },
    });

    const history = guestSessionService.getGuestHistory();
    expect(history.length).toBe(1);
    const item = history[0];
    expect(item.audioId).toBe(10);
    expect(item.title).toBe('Mục Thần Ký');
    expect(item.thumbnailUrl).toBe('https://example.com/mucthanky.jpg');
    expect(item.currentEpisodeTitle).toBe('Tập 2: Tàn Lão Thôn');
    expect(item.currentEpisodeNumber).toBe(2);
    expect(item.lastPositionSeconds).toBe(240);
    expect(item.formattedPosition).toBe('04:00');
    expect(item.progressPercent).toBe(20);
    expect(item.durationListened).toBe(125);
    expect(item.totalDurationListened).toBe(450);
  });
});
