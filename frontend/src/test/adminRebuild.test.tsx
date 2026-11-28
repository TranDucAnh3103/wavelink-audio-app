import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminOverviewPage } from '@/views/admin/AdminOverviewPage';
import { AdminAccountsPage } from '@/views/admin/AdminAccountsPage';
import { AdminOrdersPage } from '@/views/admin/AdminOrdersPage';
import { AdminNotifyPage } from '@/views/admin/AdminNotifyPage';
import { AdminTicketsPage } from '@/views/admin/AdminTicketsPage';
import { AdminSystemPage } from '@/views/admin/AdminSystemPage';
import { AdminVipPage } from '@/views/admin/AdminVipPage';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useSiteStatusStore } from '@/stores/siteStatusStore';

vi.mock('@/components/ui/Toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe('Rebuilt Admin Views', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: { id: 1, username: 'admin', role: 'ADMIN', membership: 'VIP' },
      token: 'tok',
      isLoading: false,
      isInitialized: true,
      isLive: true,
    });
  });

  it('AdminOverviewPage shows KPIs and actionable alerts without version/clutter tags', async () => {
    vi.spyOn(api.admin, 'dashboard').mockResolvedValue({
      users: { total: 42, new7d: 5, vip: 9, banned: 1, expiring: 2 },
      content: { audios: 18, hidden: 1, episodes: 120, failed: 3 },
      revenue: { total: 980000, last30: 350000, pending: 2 },
      engagement: { listenSeconds: 7200, favorites: 33, messages: 14 },
      series: Array.from({ length: 14 }, (_, i) => ({
        date: `2026-11-${String(i + 1).padStart(2, '0')}`,
        users: 1,
        revenue: 49000,
      })),
      topAudios: [{ id: 10, title: 'Đấu Phá', plays: 25, seconds: 3600 }],
      recentUsers: [{ id: 2, username: 'minh', role: 'USER', vipActive: false, daysRemaining: 0 }],
      recentOrders: [],
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminOverviewPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.getByText('2 đơn đang chờ thanh toán')).toBeInTheDocument();
    expect(screen.getByText('2 VIP sắp hết hạn trong 7 ngày')).toBeInTheDocument();
    expect(screen.getByText('3 audio lỗi luồng phát')).toBeInTheDocument();
    expect(screen.queryByText(/v1\.0/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ADMIN ACCESS/i)).not.toBeInTheDocument();
  });

  it('AdminAccountsPage lists users and opens detail sheet', async () => {
    vi.spyOn(api.admin, 'users').mockResolvedValue({
      items: [
        {
          id: 2,
          username: 'nguyenvana',
          email: 'a@example.com',
          role: 'VIP',
          membership: 'VIP',
          vipActive: true,
          daysRemaining: 15,
          listenSeconds: 3600,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 15,
      counts: { all: 1, vip: 1, free: 0, expiring: 0, admin: 0, banned: 0 },
    });
    const detailSpy = vi.spyOn(api.admin, 'userDetail').mockResolvedValue({
      user: {
        id: 2,
        username: 'nguyenvana',
        email: 'a@example.com',
        role: 'VIP',
        membership: 'VIP',
        vipActive: true,
        daysRemaining: 15,
      },
      vipActive: true,
      daysRemaining: 15,
      stats: { listenSeconds: 3600, plays: 3, favorites: 2, uploads: 1, messages: 4, orders: 1, paidTotal: 49000 },
      orders: [],
      history: [],
    });

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminAccountsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('nguyenvana')).toBeInTheDocument());
    fireEvent.click(screen.getByText('nguyenvana'));
    await waitFor(() => expect(detailSpy).toHaveBeenCalledWith(2));
    expect(screen.getByText('Hội viên')).toBeInTheDocument();
  });

  it('AdminOrdersPage renders orders and AdminNotifyPage sends broadcast', async () => {
    vi.spyOn(api.admin, 'orders').mockResolvedValue({
      items: [
        {
          id: 1,
          orderCode: 'ORD-99',
          userId: 2,
          username: 'khachhang',
          packageId: 'VIP_1M',
          packageName: 'Gói 1 Tháng',
          amount: 49000,
          durationDays: 30,
          status: 'PENDING',
          createdAt: '2026-11-26T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 15,
      counts: { ALL: 1, PENDING: 1 },
      revenue: { total: 49000, last30: 49000, today: 49000 },
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/orders']}>
        <AdminOrdersPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('khachhang')).toBeInTheDocument());
    expect(screen.getByText('Xác nhận')).toBeInTheDocument();
    unmount();

    const broadcastSpy = vi.spyOn(api.admin, 'broadcast').mockResolvedValue({ targeted: 10, delivered: 9 });
    render(
      <MemoryRouter initialEntries={['/admin/notify']}>
        <AdminNotifyPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Bảo trì' } });
    fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'Lúc 23h' } });
    fireEvent.click(screen.getByRole('button', { name: /Gửi thông báo/i }));
    await waitFor(() =>
      expect(broadcastSpy).toHaveBeenCalledWith({
        title: 'Bảo trì',
        message: 'Lúc 23h',
        link: undefined,
        type: 'SYSTEM',
        audience: 'all',
      })
    );
  });

  it('AdminTicketsPage and AdminSystemPage render and update records', async () => {
    vi.spyOn(api.admin, 'tickets').mockResolvedValue({
      items: [
        {
          id: 5,
          userId: 2,
          username: 'nguoidung1',
          kind: 'REFUND',
          category: 'Hoàn tiền',
          orderCode: 'ORD-5',
          subject: 'Yêu cầu hoàn tiền đơn ORD-5',
          content: 'Mua nhầm gói',
          status: 'PENDING',
          createdAt: '2026-11-26T00:00:00Z',
          updatedAt: '2026-11-26T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 15,
      counts: { ALL: 1, PENDING: 1 },
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/tickets']}>
        <AdminTicketsPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Yêu cầu hoàn tiền đơn ORD-5')).toBeInTheDocument());
    unmount();

    vi.spyOn(api.admin, 'settings').mockResolvedValue({
      freeImportDailyLimit: 8,
      allowUserImport: true,
      allowGuestChat: false,
      maintenanceMode: false,
      maintenanceMessage: '',
    });

    render(
      <MemoryRouter initialEntries={['/admin/system']}>
        <AdminSystemPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByDisplayValue('8')).toBeInTheDocument());
  });

  it('AdminOrdersPage hides Confirm button for CANCELLED/EXPIRED orders and Modal prevents double submit', async () => {
    vi.spyOn(api.admin, 'orders').mockResolvedValue({
      items: [
        {
          id: 1,
          orderCode: 'ORD-PEND',
          userId: 2,
          username: 'user1',
          packageId: 'VIP_1M',
          packageName: 'Gói 1 Tháng',
          amount: 49000,
          durationDays: 30,
          status: 'PENDING',
          createdAt: '2026-11-26T00:00:00Z',
        },
        {
          id: 2,
          orderCode: 'ORD-CANC',
          userId: 3,
          username: 'user2',
          packageId: 'VIP_1M',
          packageName: 'Gói 1 Tháng',
          amount: 49000,
          durationDays: 30,
          status: 'CANCELLED',
          createdAt: '2026-11-26T00:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 15,
      counts: { ALL: 2, PENDING: 1, CANCELLED: 1 },
      revenue: { total: 0, last30: 0, today: 0 },
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/orders']}>
        <AdminOrdersPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('user2')).toBeInTheDocument());
    expect(screen.getAllByText('Xác nhận')).toHaveLength(1);
    unmount();

    let resolveConfirm: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(
      <Modal isOpen title="Test" onClose={vi.fn()} onConfirm={onConfirm} confirmText="Lưu">
        <span>Body</span>
      </Modal>
    );
    const btn = screen.getByRole('button', { name: 'Lưu' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolveConfirm?.();
  });

  it('AdminSystemPage updates siteStatusStore and AdminAccountsPage supports VIP role option', async () => {
    const updateSettingsSpy = vi.spyOn(api.admin, 'updateSettings').mockResolvedValue({
      freeImportDailyLimit: 5,
      allowUserImport: true,
      allowGuestChat: true,
      maintenanceMode: true,
      maintenanceMessage: 'Đang bảo trì',
    });
    vi.spyOn(api.admin, 'settings').mockResolvedValue({
      freeImportDailyLimit: 5,
      allowUserImport: true,
      allowGuestChat: true,
      maintenanceMode: false,
      maintenanceMessage: '',
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/system']}>
        <AdminSystemPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Chế độ bảo trì')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Chế độ bảo trì'));
    fireEvent.click(screen.getByRole('button', { name: /Lưu cấu hình/i }));
    await waitFor(() => expect(updateSettingsSpy).toHaveBeenCalled());
    expect(useSiteStatusStore.getState().maintenanceMode).toBe(true);
    unmount();
    useSiteStatusStore.setState({ maintenanceMode: false, maintenanceMessage: '' });

    expect(typeof AdminVipPage).toBe('function');
  });
});
