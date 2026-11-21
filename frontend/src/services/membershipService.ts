import { axiosClient } from '@/lib/axiosClient';
import { MembershipPackage, MembershipOrder, MyMembership, PaymentInfo } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const FALLBACK_PAYMENT_INFO: PaymentInfo = {
  bankName: 'MB Bank (Quân Đội)',
  accountNumber: '0987654321',
  accountName: 'COMIC AUDIO HUB',
  notePrefix: 'VIP',
};

const FALLBACK_PACKAGES: MembershipPackage[] = [
  {
    id: 'VIP_1M',
    name: 'Gói 1 Tháng',
    durationDays: 30,
    priceVND: 49000,
    amount: 49000,
    originalCost: 59000,
    discount: 'Tiết kiệm 17%',
    description: 'Trải nghiệm toàn bộ kho truyện VIP & không giới hạn import',
    perks: [
      'Mở khóa 100% truyện độc quyền VIP',
      'Không giới hạn số lượt import YouTube',
      'Đồng bộ tiến trình đám mây ưu tiên cao nhất',
      'Huy hiệu VIP Member phong cách Manga',
    ],
  },
  {
    id: 'VIP_3M',
    name: 'Gói 3 Tháng',
    durationDays: 90,
    priceVND: 129000,
    amount: 129000,
    originalCost: 177000,
    discount: 'Tiết kiệm 27% (Khuyên dùng)',
    description: 'Tiết kiệm 15% - Đồng bộ tốc độ cao',
    perks: [
      'Mọi đặc quyền của gói VIP 1 Tháng',
      'Thời lượng kéo dài 90 ngày liên tục',
      'Cộng dồn thời hạn nếu đang có gói cũ',
      'Hỗ trợ ưu tiên khi gặp sự cố kỹ thuật',
    ],
  },
  {
    id: 'VIP_1Y',
    name: 'Gói 1 Năm',
    durationDays: 365,
    priceVND: 399000,
    amount: 399000,
    originalCost: 708000,
    discount: 'Tiết kiệm 44% (Siêu rẻ)',
    description: 'Tiết kiệm 35% - Đặc quyền tối cao',
    perks: [
      'Toàn bộ đặc quyền cao cấp nhất của hệ thống',
      '365 ngày VIP không lo gia hạn',
      'Huy hiệu Gold VIP Độc Bản',
      'Nhận thông báo sớm nhất khi có audio bom tấn mới',
    ],
  },
];

export const membershipService = {
  async getPaymentInfo(isLive = true): Promise<PaymentInfo> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: PaymentInfo }>('/membership/payment-info');
        if (res.data.success && res.data.data) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('getPaymentInfo live failed, fallback to local', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('vip_payment_info');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return FALLBACK_PAYMENT_INFO;
  },

  async updatePaymentInfo(info: PaymentInfo, isLive = true): Promise<PaymentInfo> {
    if (isLive) {
      try {
        const res = await axiosClient.put<{ success: boolean; data: PaymentInfo }>('/membership/admin/payment-info', info);
        if (res.data.success && res.data.data) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('vip_payment_info', JSON.stringify(res.data.data));
          }
          return res.data.data;
        }
      } catch (err) {
        console.warn('updatePaymentInfo live failed, saving locally', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vip_payment_info', JSON.stringify(info));
    }
    return info;
  },

  async updatePackages(packages: MembershipPackage[], isLive = true): Promise<MembershipPackage[]> {
    if (isLive) {
      try {
        const res = await axiosClient.put<{ success: boolean; data: MembershipPackage[] }>('/membership/admin/packages', {
          packages,
        });
        if (res.data.success && Array.isArray(res.data.data)) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('vip_packages', JSON.stringify(res.data.data));
          }
          return res.data.data;
        }
      } catch (err) {
        console.warn('updatePackages live failed, saving locally', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vip_packages', JSON.stringify(packages));
    }
    return packages;
  },

  async resetPackages(isLive = true): Promise<MembershipPackage[]> {
    if (isLive) {
      try {
        const res = await axiosClient.post<{ success: boolean; data: MembershipPackage[] }>('/membership/admin/packages/reset');
        if (res.data.success && Array.isArray(res.data.data)) {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('vip_packages');
          }
          return res.data.data;
        }
      } catch (err) {
        console.warn('resetPackages live failed, resetting locally', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('vip_packages');
    }
    return FALLBACK_PACKAGES;
  },
  async getPackages(isLive = true): Promise<MembershipPackage[]> {
    let pkgs = FALLBACK_PACKAGES;

    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: MembershipPackage[] }>('/membership/packages');
        if (res.data.success && Array.isArray(res.data.data)) {
          return res.data.data.map((p) => ({
            ...p,
            priceVND: p.priceVND || p.amount || 0,
            amount: p.amount || p.priceVND || 0,
          }));
        }
      } catch (err) {
        console.warn('getPackages live API failed:', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('vip_packages');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            pkgs = parsed;
          }
        } catch {}
      }
    }

    // Annotate tier locking for current user
    const user = useAuthStore.getState().user;
    const isVip = Boolean(
      user &&
      (user.role === 'VIP' || user.role === 'ADMIN' || user.membership === 'VIP') &&
      (!user.vipExpiresAt || new Date(user.vipExpiresAt).getTime() > Date.now())
    );

    if (isVip && user) {
      let currentDays = 30;
      if (typeof localStorage !== 'undefined') {
        const savedOrder = localStorage.getItem(`paid_vip_order_${user.id}`);
        if (savedOrder) {
          try {
            const parsedOrder = JSON.parse(savedOrder);
            if (parsedOrder.durationDays) {
              currentDays = parsedOrder.durationDays;
            }
          } catch {}
        }
      }

      return pkgs.map((p) => {
        const dur = p.durationDays || 30;
        if (dur <= currentDays) {
          return {
            ...p,
            isLocked: true,
            isCurrent: dur === currentDays,
            canUpgrade: false,
          };
        }
        return {
          ...p,
          isLocked: false,
          isCurrent: false,
          canUpgrade: true,
        };
      });
    }

    return pkgs.map((p) => ({
      ...p,
      isLocked: false,
      isCurrent: false,
      canUpgrade: false,
    }));
  },

  async getMyMembership(isLive = true): Promise<MyMembership> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: MyMembership }>('/membership/me');
        if (res.data.success && res.data.data) {
          return res.data.data;
        }
      } catch (err) {
        console.warn('getMyMembership failed:', err);
      }
    }

    // Local / Offline fallback
    const user = useAuthStore.getState().user;
    if (user && (user.role === 'VIP' || user.role === 'ADMIN' || user.membership === 'VIP')) {
      let daysRemaining = 30;
      if (user.vipExpiresAt) {
        const diff = new Date(user.vipExpiresAt).getTime() - Date.now();
        daysRemaining = Math.max(0, Math.ceil(diff / (24 * 3600 * 1000)));
      }
      return {
        userId: user.id,
        username: user.username,
        role: user.role,
        membership: user.membership || 'VIP',
        isVip: true,
        vipExpiresAt: user.vipExpiresAt,
        daysRemaining,
      };
    }

    return { role: user?.role || 'GUEST', isVip: false };
  },

  async createOrder(packageId: string, isLive = true): Promise<MembershipOrder> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data: MembershipOrder; error?: { message?: string } }>(
        '/membership/orders',
        { packageId }
      );
      if (res.data.success && res.data.data) {
        const order = res.data.data;
        return {
          ...order,
          priceVND: order.priceVND || order.amount,
          amount: order.amount || order.priceVND || 0,
          bankName: order.bankName || 'VietQR / payOS',
          accountNumber: order.accountNumber || '',
          accountName: order.accountName || '',
          transferContent: order.transferContent || order.orderCode,
        };
      }
      throw new Error(res.data.error?.message || 'Không thể khởi tạo đơn thanh toán payOS');
    }

    // Offline / Mock VietQR order generation
    const user = useAuthStore.getState().user;
    const pkgs = await this.getPackages(false);
    const pkg =
      pkgs.find(
        (p) =>
          p.id === packageId ||
          (p.id === 'VIP_1M' && packageId === '1_MONTH') ||
          (p.id === 'VIP_3M' && packageId === '3_MONTHS') ||
          (p.id === 'VIP_1Y' && packageId === '12_MONTHS')
      ) || pkgs[1];

    // Check tier locking for user
    if (pkg.isLocked) {
      throw new Error('Bạn đã đăng ký gói này và gói hiện đang bị khóa. Vui lòng chọn nâng cấp lên các gói cao hơn để cộng dồn thời hạn VIP!');
    }

    const payInfo = await this.getPaymentInfo(false);
    const randNum = Math.floor(100000 + Math.random() * 900000);
    const prefix = payInfo.notePrefix || 'VIP';
    const orderCode = `${prefix}-${user?.id || 1}-${randNum}`;
    const amount = pkg.priceVND || pkg.amount || 0;
    const qrDescription = encodeURIComponent(`Thanh toan don ${orderCode}`);
    const encodedAccName = encodeURIComponent(payInfo.accountName);
    const qrCodeUrl = `https://img.vietqr.io/image/970422-${payInfo.accountNumber}-compact2.png?amount=${amount}&addInfo=${qrDescription}&accountName=${encodedAccName}`;

    const mockOrder: MembershipOrder = {
      orderCode,
      packageId: pkg.id,
      packageName: pkg.name,
      amount,
      priceVND: amount,
      durationDays: pkg.durationDays,
      bankName: payInfo.bankName,
      accountNumber: payInfo.accountNumber,
      accountName: payInfo.accountName,
      transferContent: orderCode,
      qrCodeUrl,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('active_membership_order', JSON.stringify(mockOrder));
    }

    return mockOrder;
  },

  async getOrder(orderCode: string, isLive = true): Promise<MembershipOrder | null> {
    if (isLive) {
      const res = await axiosClient.get<{ success: boolean; data: MembershipOrder }>(
        `/membership/orders/${encodeURIComponent(orderCode)}`
      );
      if (res.data.success && res.data.data) {
        const order = res.data.data;
        return {
          ...order,
          priceVND: order.priceVND || order.amount,
          amount: order.amount || order.priceVND || 0,
          bankName: order.bankName || 'VietQR / payOS',
          accountNumber: order.accountNumber || '',
          accountName: order.accountName || '',
          transferContent: order.transferContent || order.orderCode,
        };
      }
      return null;
    }

    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('active_membership_order');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.orderCode === orderCode) return parsed;
        } catch {}
      }
    }
    return null;
  },

  async cancelOrder(orderCode: string, isLive = true): Promise<boolean> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean }>(
        `/membership/orders/${encodeURIComponent(orderCode)}/cancel`
      );
      return Boolean(res.data.success);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('active_membership_order');
    }
    return true;
  },

  async simulatePayment(orderCode: string, status: 'SUCCESS' | 'FAILED' = 'SUCCESS', isLive = true): Promise<unknown> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data: unknown; error?: { message?: string } }>(
        `/membership/orders/${encodeURIComponent(orderCode)}/simulate`,
        { status }
      );
      if (res.data.success) {
        return res.data.data;
      }
      throw new Error(res.data.error?.message || 'Không được phép mô phỏng thanh toán');
    }

    // Local simulation
    if (status === 'SUCCESS') {
      let durationDays = 30;
      let pkgId = 'VIP_1M';
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('active_membership_order');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.durationDays) durationDays = parsed.durationDays;
            if (parsed && parsed.packageId) pkgId = parsed.packageId;
          } catch {}
        }
      }

      const currentUser = useAuthStore.getState().user;
      let newExpiry: Date;
      if (currentUser?.vipExpiresAt && new Date(currentUser.vipExpiresAt).getTime() > Date.now()) {
        newExpiry = new Date(new Date(currentUser.vipExpiresAt).getTime() + durationDays * 86400000);
      } else {
        newExpiry = new Date(Date.now() + durationDays * 86400000);
      }

      const newRole = currentUser?.role === 'ADMIN' ? 'ADMIN' : 'VIP';
      useAuthStore.getState().updateUser({
        role: newRole,
        membership: 'VIP',
        vipExpiresAt: newExpiry.toISOString(),
      });

      if (typeof localStorage !== 'undefined' && currentUser) {
        localStorage.setItem(
          `paid_vip_order_${currentUser.id}`,
          JSON.stringify({ packageId: pkgId, durationDays, paidAt: new Date().toISOString() })
        );
      }

      return {
        success: true,
        message: 'Nâng cấp VIP thành công! Toàn bộ quyền lợi đã được kích hoạt.',
      };
    }

    return {
      success: false,
      message: 'Giao dịch mô phỏng thất bại hoặc đã bị người dùng hủy',
    };
  },

  async cancelVip(reason?: string, isLive = true): Promise<boolean> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; message?: string }>('/membership/cancel-vip', { reason });
      if (!res.data.success) throw new Error(res.data.message || 'Lỗi khi hủy gói VIP');
      return true;
    }
    return false;
  },

  async requestRefund(orderCode: string, reason: string, bankInfo?: string, isLive = true): Promise<boolean> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; message?: string }>('/membership/refund', {
        orderCode,
        reason,
        bankInfo,
      });
      if (!res.data.success) throw new Error(res.data.message || 'Lỗi gửi yêu cầu hoàn tiền');
      return true;
    }
    return false;
  },

  async submitComplaint(subject: string, content: string, category = 'Chung', isLive = true): Promise<boolean> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; message?: string }>('/membership/complaint', {
        subject,
        content,
        category,
      });
      if (!res.data.success) throw new Error(res.data.message || 'Lỗi gửi khiếu nại');
      return true;
    }
    return false;
  },
};
