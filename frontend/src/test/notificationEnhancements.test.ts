import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNotificationPageSize } from '@/config/pagination';
import { notificationService } from '@/services/notificationService';
import {
  externalNotificationService,
  normalizeNotificationPath,
} from '@/services/externalNotificationService';

describe('Notification Enhancements & Requirements', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Pagination configuration (12 items/page from env)', () => {
    it('returns 12 items per page from env or default', () => {
      const pageSize = getNotificationPageSize();
      expect(pageSize).toBe(12);
    });
  });

  describe('Notification deletion (delete all & delete single)', () => {
    it('deletes all notifications from local storage and handles offline/fallback', async () => {
      const initialNotifs = [
        { id: 1, title: 'Thông báo 1', message: 'Nội dung 1', isRead: false, type: 'SYSTEM', createdAt: '2026-10-16' },
        { id: 2, title: 'Thông báo 2', message: 'Nội dung 2', isRead: true, type: 'VIP', createdAt: '2026-10-16' },
      ];
      localStorage.setItem('wavelink_local_notifications', JSON.stringify(initialNotifs));

      const beforeDelete = await notificationService.getNotifications(false);
      expect(beforeDelete.length).toBe(2);

      await notificationService.deleteAllNotifications(false);
      const afterDelete = await notificationService.getNotifications(false);
      expect(afterDelete.length).toBe(0);
    });

    it('deletes a single notification by id', async () => {
      const initialNotifs = [
        { id: 'item-1', title: 'Thông báo 1', message: 'Nội dung 1', isRead: false, type: 'SYSTEM', createdAt: '2026-10-16' },
        { id: 'item-2', title: 'Thông báo 2', message: 'Nội dung 2', isRead: true, type: 'VIP', createdAt: '2026-10-16' },
      ];
      localStorage.setItem('wavelink_local_notifications', JSON.stringify(initialNotifs));

      await notificationService.deleteNotification('item-1', false);
      const remaining = await notificationService.getNotifications(false);
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe('item-2');
    });
  });

  describe('Notification Settings & Preferences', () => {
    it('manages blockAll and externalAudio preferences', async () => {
      const defaultPrefs = notificationService.getLocalPreferences();
      expect(defaultPrefs.blockAll).toBe(false);
      expect(defaultPrefs.externalAudio).toBe(true);

      // Cập nhật chặn toàn bộ thông báo (DND)
      await notificationService.updatePreferences({
        ...defaultPrefs,
        blockAll: true,
      }, false);

      const updatedPrefs = notificationService.getLocalPreferences();
      expect(updatedPrefs.blockAll).toBe(true);

      // Cập nhật tắt nhận audio ngoài app
      await notificationService.updatePreferences({
        ...updatedPrefs,
        externalAudio: false,
      }, false);

      const finalPrefs = notificationService.getLocalPreferences();
      expect(finalPrefs.externalAudio).toBe(false);
      expect(finalPrefs.blockAll).toBe(true);
    });
  });

  describe('External Notification & Anti-Spam Logic', () => {
    it('blocks external notifications when blockAll is enabled', async () => {
      notificationService.saveLocalPreferences({
        notifyNewEpisodes: true,
        notifyMembership: true,
        notifySystem: true,
        blockAll: true,
        externalAudio: true,
      });

      // Mock notification support & permission
      vi.spyOn(externalNotificationService, 'isSupported').mockReturnValue(true);
      vi.spyOn(externalNotificationService, 'getPermission').mockReturnValue('granted');

      const result = await externalNotificationService.showSystemNotification('Audio Mới', {
        body: 'Nội dung audio',
        type: 'audio',
      });

      // Bị chặn vì blockAll = true
      expect(result).toBe(false);
    });

    it('blocks audio notifications when externalAudio is false', async () => {
      notificationService.saveLocalPreferences({
        notifyNewEpisodes: true,
        notifyMembership: true,
        notifySystem: true,
        blockAll: false,
        externalAudio: false,
      });

      vi.spyOn(externalNotificationService, 'isSupported').mockReturnValue(true);
      vi.spyOn(externalNotificationService, 'getPermission').mockReturnValue('granted');

      const result = await externalNotificationService.showSystemNotification('Audio Mới', {
        body: 'Nội dung audio',
        type: 'audio',
      });

      // Bị chặn vì externalAudio = false
      expect(result).toBe(false);
    });

    it('prevents rapid spamming of duplicate notifications (Anti-Spam)', async () => {
      notificationService.saveLocalPreferences({
        notifyNewEpisodes: true,
        notifyMembership: true,
        notifySystem: true,
        blockAll: false,
        externalAudio: true,
      });

      vi.spyOn(externalNotificationService, 'isSupported').mockReturnValue(true);
      vi.spyOn(externalNotificationService, 'getPermission').mockReturnValue('granted');

      // Giả lập Notification constructor
      const showMock = vi.fn();
      // @ts-ignore
      global.Notification = class {
        constructor() {
          showMock();
        }
      };

      // Thông báo đầu tiên gửi thành công
      const first = await externalNotificationService.showSystemNotification('Tập truyện mới 1', {
        body: 'Audio tập 1',
        tag: 'tag-ep-1',
      });
      expect(first).toBe(true);

      // Thông báo thứ hai gửi ngay lập tức (trong vòng 15 giây) phải bị chặn bởi Anti-Spam
      const second = await externalNotificationService.showSystemNotification('Tập truyện mới 2', {
        body: 'Audio tập 2',
        tag: 'tag-ep-2',
      });
      expect(second).toBe(false);
    });

    it('normalizes legacy hash notification links to BrowserRouter routes', () => {
      expect(normalizeNotificationPath('#/player?audioId=42')).toBe('/player/42');
      expect(normalizeNotificationPath('/#/player?id=99')).toBe('/player/99');
      expect(normalizeNotificationPath('#/notifications')).toBe('/notifications');
      expect(normalizeNotificationPath('/membership')).toBe('/membership');
      expect(normalizeNotificationPath(undefined)).toBe('/notifications');
    });
  });
});
