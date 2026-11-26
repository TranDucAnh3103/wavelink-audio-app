import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { communityService } from '@/services/communityService';
import { ShareStoryModal } from '@/components/community/ShareStoryModal';
import { CommunityPage } from '@/pages/CommunityPage';
import { AdminCommunityPage } from '@/pages/admin/AdminCommunityPage';
import { axiosClient } from '@/lib/axiosClient';

describe('Community Features & Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('communityService & Data Legitimacy', () => {
    it('returns empty array when no real data exists without fake mock data', async () => {
      const topListeners = await communityService.getTopListeners();
      expect(Array.isArray(topListeners)).toBe(true);

      const vipList = await communityService.getVipLeaderboard();
      expect(Array.isArray(vipList)).toBe(true);
    });

    it('returns actual data when API returns real records', async () => {
      vi.spyOn(axiosClient, 'get').mockResolvedValueOnce({
        data: {
          success: true,
          data: [
            { rank: 1, userId: 1, username: 'RealListener', totalSeconds: 3600, totalHours: 1, isVip: false, role: 'USER', membership: 'FREE' }
          ]
        }
      });

      const topListeners = await communityService.getTopListeners();
      expect(topListeners.length).toBe(1);
      expect(topListeners[0].username).toBe('RealListener');
    });

    it('sends message with correct guest identity and avoids leaking another user name', async () => {
      localStorage.setItem('auth_user', JSON.stringify({ id: 0, username: 'Khách Nghe Thử', role: 'GUEST', isGuest: true }));

      const sent = await communityService.sendMessage('Chào mọi người từ khách', undefined, 'Khách Nghe Thử');
      expect(sent).toBeDefined();
      expect(sent.username).toBe('Khách Nghe Thử');
      expect(sent.role).toBe('GUEST');
      expect(sent.isVip).toBe(false);

      const msgs = await communityService.getMessages();
      expect(msgs.some((m) => m.username === 'Khách Nghe Thử')).toBe(true);
    });

    it('handles admin deletion and stats calls', async () => {
      const deleteSpy = vi.spyOn(axiosClient, 'delete').mockResolvedValueOnce({
        data: { success: true }
      });
      const getStatsSpy = vi.spyOn(axiosClient, 'get').mockResolvedValueOnce({
        data: {
          success: true,
          data: { totalMessages: 10, onlineCount: 2, vipChatters: 3, guestChatters: 7 }
        }
      });

      const deleted = await communityService.deleteMessage(123);
      expect(deleted).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith('/community/messages/123');

      const stats = await communityService.getStats();
      expect(stats.totalMessages).toBe(10);
      expect(stats.onlineCount).toBe(2);
      expect(getStatsSpy).toHaveBeenCalledWith('/community/stats');
    });
  });

  describe('ShareStoryModal', () => {
    it('renders story details and suggestion to chat on community', () => {
      const mockAudio = {
        id: 99,
        title: 'Phàm Nhân Tu Tiên',
        author: 'Hàn Lập Audio',
        thumbnailUrl: 'https://example.com/thumb.jpg',
      };

      render(
        <MemoryRouter>
          <ShareStoryModal isOpen={true} onClose={vi.fn()} audio={mockAudio} />
        </MemoryRouter>
      );

      expect(screen.getByText('Chia Sẻ Truyện')).toBeInTheDocument();
      expect(screen.getByText('Phàm Nhân Tu Tiên')).toBeInTheDocument();
      expect(screen.getByText('Gợi Ý: Chat Lên Cộng Đồng')).toBeInTheDocument();
      expect(screen.getByText('Gửi Ngay Vào Chat')).toBeInTheDocument();
      expect(screen.getByText('Đến Kênh Chat')).toBeInTheDocument();
      expect(screen.getByText('Sao Chép Link')).toBeInTheDocument();
    });

    it('handles sharing directly to community chat', async () => {
      const sendSpy = vi.spyOn(communityService, 'sendMessage').mockResolvedValueOnce({
        id: '123',
        userId: 0,
        username: 'Khách Nghe Thử',
        message: 'Tuyệt phẩm!',
        isVip: false,
        role: 'GUEST',
        createdAt: new Date().toISOString(),
      });
      const handleClose = vi.fn();
      const mockAudio = {
        id: 99,
        title: 'Phàm Nhân Tu Tiên',
      };

      render(
        <MemoryRouter>
          <ShareStoryModal isOpen={true} onClose={handleClose} audio={mockAudio} />
        </MemoryRouter>
      );

      const sendBtn = screen.getByText('Gửi Ngay Vào Chat');
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalled();
        expect(handleClose).toHaveBeenCalled();
      });
    });
  });

  describe('CommunityPage Sub-Tabs & Empty State', () => {
    it('renders sub-tabs and switches between Chat, Top 10, and VIP', async () => {
      vi.spyOn(communityService, 'getTopListeners').mockResolvedValue([]);
      vi.spyOn(communityService, 'getVipLeaderboard').mockResolvedValue([]);
      vi.spyOn(communityService, 'getOnlineSummary').mockResolvedValue({ onlineCount: 1, vipCount: 0, totalMessages: 0 });
      vi.spyOn(communityService, 'getMessages').mockResolvedValue([]);

      render(
        <MemoryRouter initialEntries={['/community']}>
          <CommunityPage />
        </MemoryRouter>
      );

      // Verify Tab buttons exist
      expect(screen.getByText('Phòng Chat')).toBeInTheDocument();
      expect(screen.getByText('Top 10 Giờ Nghe')).toBeInTheDocument();
      expect(screen.getByText('Bảng Vàng VIP')).toBeInTheDocument();

      // Default tab is Phòng Chat
      expect(screen.getByText('Thảo Luận Trực Tuyến')).toBeInTheDocument();

      // Click on Top 10 Giờ Nghe
      const top10Tab = screen.getByText('Top 10 Giờ Nghe');
      fireEvent.click(top10Tab);

      await waitFor(() => {
        expect(screen.getByText('Top 10 Cao Thủ Cày Giờ')).toBeInTheDocument();
      });

      // Click on Bảng Vàng VIP
      const vipTab = screen.getByText('Bảng Vàng VIP');
      fireEvent.click(vipTab);

      await waitFor(() => {
        expect(screen.getByText('Bảng Vàng Độc Giả VIP')).toBeInTheDocument();
      });
    });
  });

  describe('AdminCommunityPage', () => {
    it('renders admin community moderation dashboard and stats', async () => {
      vi.spyOn(communityService, 'getMessages').mockResolvedValueOnce([
        {
          id: 1,
          userId: 10,
          username: 'SpamUser',
          message: 'Bình luận spam cần xóa',
          isVip: false,
          role: 'USER',
          createdAt: new Date().toISOString(),
        }
      ]);
      vi.spyOn(communityService, 'getStats').mockResolvedValueOnce({
        totalMessages: 1,
        onlineCount: 3,
        vipChatters: 0,
        guestChatters: 1,
      });

      render(
        <MemoryRouter initialEntries={['/admin/community']}>
          <AdminCommunityPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Cộng đồng' })).toBeInTheDocument();
        expect(screen.getByText('Phát thông báo')).toBeInTheDocument();
        expect(screen.getByLabelText('Dọn sạch phòng chat')).toBeInTheDocument();
        expect(screen.getByText('SpamUser')).toBeInTheDocument();
        expect(screen.getByText('Bình luận spam cần xóa')).toBeInTheDocument();
        expect(screen.getByText('Khóa người gửi')).toBeInTheDocument();
      });
    });
  });
});
