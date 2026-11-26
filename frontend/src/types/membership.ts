export interface MembershipPackage {
  id: string;
  name: string;
  durationDays: number;
  priceVND: number;
  amount?: number;
  description: string;
  originalCost?: number;
  discount?: string;
  perks?: string[];
  isLocked?: boolean;
  isCurrent?: boolean;
  canUpgrade?: boolean;
}

export interface PaymentInfo {
  bankName: string;
  accountNumber: string;
  accountName: string;
  notePrefix?: string;
  provider?: string;
  payosConfigured?: boolean;
}

export interface MyMembership {
  userId?: number;
  username?: string;
  role: string;
  membership?: string;
  isVip: boolean;
  vipExpiresAt?: string | null;
  daysRemaining?: number;
  latestOrder?: MembershipOrder | null;
  activePendingOrder?: MembershipOrder | null;
  latestPaidOrder?: MembershipOrder | null;
  paidOrdersCount?: number;
  token?: string;
}

export interface MembershipOrder {
  id?: number;
  orderCode: string;
  payosOrderCode?: number;
  paymentLinkId?: string;
  checkoutUrl?: string;
  qrCode?: string;
  provider?: string;
  bankBin?: string;
  userId?: number;
  packageId: string;
  packageName?: string;
  amount: number;
  priceVND?: number;
  durationDays?: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  transferContent: string;
  qrCodeUrl: string;
  status: string;
  expiresAt?: string;
  remainingSeconds?: number;
  reused?: boolean;
  deleted?: boolean;
  alreadyPaid?: boolean;
  message?: string;
  paidAt?: string | null;
  createdAt?: string;
  token?: string;
  user?: {
    id: number;
    username: string;
    role: 'ADMIN' | 'VIP' | 'USER' | 'GUEST';
    membership?: string;
    vipExpiresAt?: string | null;
  };
}

export interface MembershipOrdersResponse {
  orders: MembershipOrder[];
  activePendingOrder: MembershipOrder | null;
  paidCount: number;
  token?: string;
  user?: MembershipOrder['user'];
}

export interface CancelOrderResult {
  success: boolean;
  orderCode?: string;
  status?: string;
  deleted?: boolean;
  alreadyPaid?: boolean;
  message?: string;
  token?: string;
  user?: MembershipOrder['user'];
}
