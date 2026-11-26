import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from '@/views/ProfilePage';
import { membershipService } from '@/services/membershipService';
import { useAuthStore } from '@/stores/authStore';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe('VIP Order Lifecycle & Profile Payment History', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: {
        id: 101,
        username: 'vip_buyer',
        email: 'vip_buyer@example.com',
        role: 'USER',
        membership: 'FREE',
        isGuest: false,
      },
      token: 'offline-token',
      isLive: false,
      isLoading: false,
      isInitialized: true,
    });
  });

  const renderProfile = () => {
    const qc = createTestQueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/profile']}>
          <Routes>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/membership" element={<div>Membership Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('shows pending VIP 1 Month order in Profile right after placing order', async () => {
    const order = await membershipService.createOrder('VIP_1M', false);

    renderProfile();

    await waitFor(() => {
      expect(screen.getByTestId('profile-pending-vip-order')).toBeInTheDocument();
      expect(screen.getByText(/Gói 1 Tháng/)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(order.orderCode))).toBeInTheDocument();
      expect(screen.getByText('Tiếp Tục Thanh Toán QR')).toBeInTheDocument();
      expect(screen.getByText('Hủy Đơn')).toBeInTheDocument();
    });
  });

  it('automatically purges expired QR pending order and removes it from Profile history', async () => {
    const expiredOrder = {
      orderCode: 'VIP-EXPIRED-999',
      userId: 101,
      packageId: 'VIP_1M',
      packageName: 'Gói 1 Tháng',
      amount: 49000,
      priceVND: 49000,
      durationDays: 30,
      bankName: 'MB Bank (Quân Đội)',
      accountNumber: '0987654321',
      accountName: 'COMIC AUDIO HUB',
      transferContent: 'VIP-EXPIRED-999',
      qrCodeUrl: 'https://example.com/qr.png',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: new Date(Date.now() - 16 * 60_000).toISOString(),
    };
    localStorage.setItem('wavelink_vip_orders_101', JSON.stringify([expiredOrder]));

    const ordersRes = await membershipService.getMyOrders(false);
    expect(ordersRes.orders).toHaveLength(0);
    expect(ordersRes.activePendingOrder).toBeNull();

    renderProfile();

    await waitFor(() => {
      expect(screen.getByTestId('profile-vip-orders-section')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('profile-pending-vip-order')).not.toBeInTheDocument();
    expect(screen.queryByText(/VIP-EXPIRED-999/)).not.toBeInTheDocument();
  });

  it('deletes pending order immediately when user clicks cancel in Profile', async () => {
    const order = await membershipService.createOrder('VIP_1M', false);

    renderProfile();

    await waitFor(() => {
      expect(screen.getByTestId('profile-pending-vip-order')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Hủy Đơn'));

    await waitFor(() => {
      expect(screen.queryByTestId('profile-pending-vip-order')).not.toBeInTheDocument();
      expect(screen.queryByText(new RegExp(order.orderCode))).not.toBeInTheDocument();
    });

    const afterCancel = await membershipService.getMyOrders(false);
    expect(afterCancel.orders).toHaveLength(0);
  });

  it('persists PAID VIP order in Profile history and opens receipt modal on Xem chi tiết', async () => {
    const order = await membershipService.createOrder('VIP_1M', false);
    await membershipService.simulatePayment(order.orderCode, 'SUCCESS', false);

    renderProfile();

    await waitFor(() => {
      expect(screen.getByTestId('profile-paid-vip-history')).toBeInTheDocument();
      expect(screen.getByText('ĐÃ THANH TOÁN')).toBeInTheDocument();
    });

    const detailBtn = screen.getByTestId(`view-order-detail-${order.orderCode}`);
    fireEvent.click(detailBtn);

    await waitFor(() => {
      const modal = screen.getByTestId('order-detail-modal');
      expect(modal).toBeInTheDocument();
      expect(screen.getByText('CHI TIẾT ĐƠN HÀNG VIP')).toBeInTheDocument();
      expect(modal).toHaveTextContent(order.orderCode);
      expect(modal).toHaveTextContent('Gói 1 Tháng');
      expect(modal).toHaveTextContent('49.000');
      expect(modal).toHaveTextContent(order.transferContent);
    });
  });
});
