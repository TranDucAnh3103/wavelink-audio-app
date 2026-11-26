import { axiosClient } from '@/lib/axiosClient';
import {
  MembershipPackage,
  MembershipOrder,
  MembershipOrdersResponse,
  CancelOrderResult,
  MyMembership,
  PaymentInfo,
} from '@/types';
import { useAuthStore } from '@/stores/authStore';

const LOCAL_ORDERS_PREFIX = 'wavelink_vip_orders_';

function getLocalOrdersKey(userId?: number | string): string {
  return `${LOCAL_ORDERS_PREFIX}${userId ?? 'guest'}`;
}

function isOrderExpired(order: MembershipOrder): boolean {
  if (order.status !== 'PENDING' || !order.expiresAt) return false;
  const expMs = new Date(order.expiresAt).getTime();
  return !Number.isNaN(expMs) && expMs <= Date.now();
}

function normalizeOrder(order: MembershipOrder): MembershipOrder {
  const remainingSeconds =
    order.status === 'PENDING' && order.expiresAt
      ? Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000))
      : 0;
  return {
    ...order,
    priceVND: order.priceVND || order.amount || 0,
    amount: order.amount || order.priceVND || 0,
    bankName: order.bankName || 'VietQR / payOS',
    accountNumber: order.accountNumber || '',
    accountName: order.accountName || '',
    transferContent: order.transferContent || order.orderCode,
    remainingSeconds: order.remainingSeconds ?? remainingSeconds,
  };
}

function syncAuthFromPaymentPayload(payload?: {
  token?: string;
  user?: MembershipOrder['user'];
}): void {
  if (!payload) return;
  if (payload.token && typeof localStorage !== 'undefined') {
    localStorage.setItem('auth_token', payload.token);
  }
  if (payload.user) {
    useAuthStore.getState().updateUser({
      role: payload.user.role,
      membership: payload.user.membership as 'FREE' | 'VIP' | undefined,
      vipExpiresAt: payload.user.vipExpiresAt || undefined,
    });
  }
}

function sortLocalOrders(orders: MembershipOrder[]): MembershipOrder[] {
  return [...orders].sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
    const tA = new Date(a.paidAt || a.createdAt || 0).getTime();
    const tB = new Date(b.paidAt || b.createdAt || 0).getTime();
    return tB - tA;
  });
}

function readAndCleanLocalOrders(userId?: number | string): {
  orders: MembershipOrder[];
  prunedOrderCodes: string[];
} {
  if (typeof localStorage === 'undefined') {
    return { orders: [], prunedOrderCodes: [] };
  }
  const key = getLocalOrdersKey(userId);
  let rawList: MembershipOrder[] = [];
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rawList = parsed;
    } catch {}
  }

  // Also absorb legacy active_membership_order if missing from list
  const legacyRaw = localStorage.getItem('active_membership_order');
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as MembershipOrder;
      if (
        legacy &&
        legacy.orderCode &&
        (!userId || !legacy.userId || String(legacy.userId) === String(userId)) &&
        !rawList.some((o) => o.orderCode === legacy.orderCode)
      ) {
        rawList.unshift(legacy);
      }
    } catch {}
  }

  const kept: MembershipOrder[] = [];
  const prunedOrderCodes: string[] = [];
  for (const item of rawList) {
    if (!item || !item.orderCode) continue;
    if (item.status === 'EXPIRED' || item.status === 'CANCELLED' || item.status === 'FAILED') {
      prunedOrderCodes.push(item.orderCode);
      continue;
    }
    if (isOrderExpired(item)) {
      prunedOrderCodes.push(item.orderCode);
      continue;
    }
    if (item.status === 'PENDING' || item.status === 'PAID') {
      kept.push(normalizeOrder(item));
    }
  }

  const sorted = sortLocalOrders(kept);
  if (prunedOrderCodes.length > 0 || (raw === null && sorted.length > 0)) {
    try {
      localStorage.setItem(key, JSON.stringify(sorted));
    } catch {}
  }
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as MembershipOrder;
      if (legacy && prunedOrderCodes.includes(legacy.orderCode)) {
        localStorage.removeItem('active_membership_order');
      }
    } catch {}
  }

  return { orders: sorted, prunedOrderCodes };
}

function writeLocalOrders(userId: number | string | undefined, orders: MembershipOrder[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getLocalOrdersKey(userId), JSON.stringify(sortLocalOrders(orders)));
  } catch {}
}

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
            localStorage.removeItem('vip_payment_info');
          }
          return res.data.data;
        }
      } catch (err) {
        console.warn('updatePaymentInfo live failed, saving locally', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('vip_payment_info', JSON.stringify(info));
      } catch {}
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
            localStorage.removeItem('vip_packages');
          }
          return res.data.data;
        }
      } catch (err) {
        console.warn('updatePackages live failed, saving locally', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('vip_packages', JSON.stringify(packages));
      } catch {}
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
          const data = res.data.data;
          if (data.token || (data.role && data.membership)) {
            const currentUser = useAuthStore.getState().user;
            syncAuthFromPaymentPayload({
              token: data.token,
              user: currentUser
                ? {
                    id: currentUser.id,
                    username: currentUser.username,
                    role: data.role as 'ADMIN' | 'VIP' | 'USER' | 'GUEST',
                    membership: data.membership,
                    vipExpiresAt: data.vipExpiresAt,
                  }
                : undefined,
            });
          }
          return {
            ...data,
            activePendingOrder: data.activePendingOrder ? normalizeOrder(data.activePendingOrder) : null,
            latestPaidOrder: data.latestPaidOrder ? normalizeOrder(data.latestPaidOrder) : null,
            latestOrder: data.latestOrder ? normalizeOrder(data.latestOrder) : null,
          };
        }
      } catch (err) {
        console.warn('getMyMembership failed:', err);
      }
    }

    // Local / Offline fallback
    const user = useAuthStore.getState().user;
    const { orders } = readAndCleanLocalOrders(user?.id);
    const activePendingOrder = orders.find((o) => o.status === 'PENDING') || null;
    const paidOrders = orders.filter((o) => o.status === 'PAID');
    const latestPaidOrder = paidOrders[0] || null;
    const latestOrder = activePendingOrder || latestPaidOrder;

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
        activePendingOrder,
        latestPaidOrder,
        latestOrder,
        paidOrdersCount: paidOrders.length,
      };
    }

    return {
      role: user?.role || 'GUEST',
      isVip: false,
      activePendingOrder,
      latestPaidOrder,
      latestOrder,
      paidOrdersCount: paidOrders.length,
    };
  },

  async getMyOrders(isLive = true): Promise<MembershipOrdersResponse> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: MembershipOrdersResponse }>('/membership/orders');
        if (res.data.success && res.data.data) {
          const data = res.data.data;
          syncAuthFromPaymentPayload({ token: data.token, user: data.user });
          const orders = Array.isArray(data.orders) ? data.orders.map(normalizeOrder) : [];
          const activePendingOrder = data.activePendingOrder
            ? normalizeOrder(data.activePendingOrder)
            : orders.find((o) => o.status === 'PENDING') || null;
          const paidCount =
            typeof data.paidCount === 'number'
              ? data.paidCount
              : orders.filter((o) => o.status === 'PAID').length;
          return {
            orders,
            activePendingOrder,
            paidCount,
            token: data.token,
            user: data.user,
          };
        }
      } catch (err) {
        console.warn('getMyOrders live failed, fallback to local:', err);
      }
    }

    const user = useAuthStore.getState().user;
    const { orders } = readAndCleanLocalOrders(user?.id);
    const activePendingOrder = orders.find((o) => o.status === 'PENDING') || null;
    const paidCount = orders.filter((o) => o.status === 'PAID').length;
    return {
      orders,
      activePendingOrder,
      paidCount,
    };
  },

  async createOrder(packageId: string, isLive = true): Promise<MembershipOrder> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data: MembershipOrder; error?: { message?: string } }>(
        '/membership/orders',
        { packageId }
      );
      if (res.data.success && res.data.data) {
        return normalizeOrder(res.data.data);
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

    const amount = pkg.priceVND || pkg.amount || 0;
    const { orders } = readAndCleanLocalOrders(user?.id);
    const existingSame = orders.find(
      (o) =>
        o.status === 'PENDING' &&
        o.packageId === pkg.id &&
        o.amount === amount &&
        o.expiresAt &&
        new Date(o.expiresAt).getTime() - Date.now() > 2 * 60 * 1000
    );
    if (existingSame) {
      return { ...normalizeOrder(existingSame), reused: true };
    }

    const payInfo = await this.getPaymentInfo(false);
    const randNum = Math.floor(100000 + Math.random() * 900000);
    const prefix = payInfo.notePrefix || 'VIP';
    const orderCode = `${prefix}-${user?.id || 1}-${randNum}`;
    const qrDescription = encodeURIComponent(`Thanh toan don ${orderCode}`);
    const encodedAccName = encodeURIComponent(payInfo.accountName);
    const qrCodeUrl = `https://img.vietqr.io/image/970422-${payInfo.accountNumber}-compact2.png?amount=${amount}&addInfo=${qrDescription}&accountName=${encodedAccName}`;

    const mockOrder: MembershipOrder = normalizeOrder({
      orderCode,
      userId: user?.id,
      packageId: pkg.id,
      packageName: pkg.name,
      amount,
      priceVND: amount,
      durationDays: pkg.durationDays,
      provider: 'VIETQR_DEV',
      bankName: payInfo.bankName,
      accountNumber: payInfo.accountNumber,
      accountName: payInfo.accountName,
      transferContent: orderCode,
      qrCodeUrl,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    // Replace any old superseded PENDING order while preserving all PAID orders
    const nextOrders = [mockOrder, ...orders.filter((o) => o.status !== 'PENDING')];
    writeLocalOrders(user?.id, nextOrders);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('active_membership_order', JSON.stringify(mockOrder));
    }

    return mockOrder;
  },

  async getOrder(orderCode: string, isLive = true): Promise<MembershipOrder | null> {
    if (isLive) {
      try {
        const res = await axiosClient.get<{ success: boolean; data: MembershipOrder }>(
          `/membership/orders/${encodeURIComponent(orderCode)}`
        );
        if (res.data.success && res.data.data) {
          const data = res.data.data;
          syncAuthFromPaymentPayload({ token: data.token, user: data.user });
          return normalizeOrder(data);
        }
        return null;
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          return null;
        }
        throw err;
      }
    }

    const user = useAuthStore.getState().user;
    const { orders, prunedOrderCodes } = readAndCleanLocalOrders(user?.id);
    if (prunedOrderCodes.includes(orderCode)) {
      return {
        orderCode,
        packageId: '',
        amount: 0,
        bankName: '',
        accountNumber: '',
        accountName: '',
        transferContent: orderCode,
        qrCodeUrl: '',
        status: 'EXPIRED',
        deleted: true,
        message: 'Đơn hàng đã quá hạn thanh toán QR và đã được xóa khỏi lịch sử',
      };
    }
    const found = orders.find((o) => o.orderCode === orderCode);
    return found ? normalizeOrder(found) : null;
  },

  async cancelOrder(orderCode: string, isLive = true): Promise<CancelOrderResult> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data?: CancelOrderResult }>(
        `/membership/orders/${encodeURIComponent(orderCode)}/cancel`
      );
      const data = res.data.data;
      if (data) {
        syncAuthFromPaymentPayload({ token: data.token, user: data.user });
      }
      return {
        success: Boolean(res.data.success),
        orderCode: data?.orderCode || orderCode,
        status: data?.status || 'CANCELLED',
        deleted: data?.deleted ?? true,
        alreadyPaid: data?.alreadyPaid,
        message: data?.message,
        token: data?.token,
        user: data?.user,
      };
    }

    const user = useAuthStore.getState().user;
    const { orders } = readAndCleanLocalOrders(user?.id);
    const existing = orders.find((o) => o.orderCode === orderCode);
    if (existing?.status === 'PAID') {
      return {
        success: true,
        orderCode,
        status: 'PAID',
        deleted: false,
        alreadyPaid: true,
        message: 'Đơn hàng đã thanh toán thành công, không thể hủy',
      };
    }

    const nextOrders = orders.filter((o) => o.orderCode !== orderCode);
    writeLocalOrders(user?.id, nextOrders);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('active_membership_order');
    }
    return {
      success: true,
      orderCode,
      status: 'CANCELLED',
      deleted: true,
      message: 'Đã hủy và xóa đơn hàng chưa thanh toán',
    };
  },

  async simulatePayment(orderCode: string, status: 'SUCCESS' | 'FAILED' = 'SUCCESS', isLive = true): Promise<unknown> {
    if (isLive) {
      const res = await axiosClient.post<{ success: boolean; data: { token?: string; user?: MembershipOrder['user'] }; error?: { message?: string } }>(
        `/membership/orders/${encodeURIComponent(orderCode)}/simulate`,
        { status }
      );
      if (res.data.success) {
        syncAuthFromPaymentPayload(res.data.data);
        return res.data.data;
      }
      throw new Error(res.data.error?.message || 'Không được phép mô phỏng thanh toán');
    }

    // Local simulation
    const currentUser = useAuthStore.getState().user;
    const { orders } = readAndCleanLocalOrders(currentUser?.id);
    let targetOrder = orders.find((o) => o.orderCode === orderCode);
    if (!targetOrder) {
      targetOrder = orders.find((o) => o.status === 'PENDING');
    }

    if (status === 'SUCCESS') {
      let durationDays = targetOrder?.durationDays || 30;
      let pkgId = targetOrder?.packageId || 'VIP_1M';
      if (!targetOrder && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('active_membership_order');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed?.durationDays) durationDays = parsed.durationDays;
            if (parsed?.packageId) pkgId = parsed.packageId;
          } catch {}
        }
      }

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

      const paidAt = new Date().toISOString();
      if (targetOrder) {
        const paidOrder: MembershipOrder = normalizeOrder({
          ...targetOrder,
          status: 'PAID',
          paidAt,
        });
        const nextOrders = orders.map((o) => (o.orderCode === targetOrder!.orderCode ? paidOrder : o));
        writeLocalOrders(currentUser?.id, nextOrders);
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('active_membership_order');
        if (currentUser) {
          localStorage.setItem(
            `paid_vip_order_${currentUser.id}`,
            JSON.stringify({ packageId: pkgId, durationDays, paidAt })
          );
        }
      }

      return {
        success: true,
        message: 'Nâng cấp VIP thành công! Toàn bộ quyền lợi đã được kích hoạt.',
      };
    }

    // FAILED simulation -> remove unpaid pending order
    if (targetOrder) {
      writeLocalOrders(
        currentUser?.id,
        orders.filter((o) => o.orderCode !== targetOrder!.orderCode)
      );
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('active_membership_order');
    }

    return {
      success: false,
      deleted: true,
      message: 'Giao dịch mô phỏng thất bại, đơn hàng đã bị hủy và xóa khỏi lịch sử',
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
