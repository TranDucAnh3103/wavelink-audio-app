import { User } from './auth';
import { AudioItem, Episode } from './audio';

export interface Paged<T, C = Record<string, number>> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  counts: C;
}

export interface AdminUser extends User {
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string | null;
  lastLoginAt?: string | null;
  vipActive: boolean;
  daysRemaining: number;
  listenSeconds?: number;
}

export type AdminUserFilter = 'all' | 'vip' | 'free' | 'expiring' | 'admin' | 'banned';

export interface AdminOrder {
  id: number;
  orderCode: string;
  userId: number;
  username: string;
  email?: string;
  packageId: string;
  packageName: string;
  amount: number;
  durationDays: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'FAILED' | 'REFUNDED' | string;
  provider?: string;
  createdAt: string;
  paidAt?: string | null;
  expiresAt?: string;
}

export interface AdminOrderList extends Paged<AdminOrder> {
  revenue: { total: number; last30: number; today: number };
}

export interface AdminUserDetail {
  user: AdminUser;
  vipActive: boolean;
  daysRemaining: number;
  stats: {
    listenSeconds: number;
    plays: number;
    favorites: number;
    uploads: number;
    messages: number;
    orders: number;
    paidTotal: number;
  };
  orders: AdminOrder[];
  history: {
    audioId: number;
    title: string;
    episodeNumber: number;
    durationListened: number;
    createdAt: string;
  }[];
}

export type AdminAudio = AudioItem & {
  streamStatus?: string;
  viewCount?: number;
  creatorUsername?: string;
};

export interface AdminEpisodeRow extends Episode {
  inProgressCount: number;
  completedCount: number;
}

export interface AdminDashboard {
  users: { total: number; new7d: number; vip: number; banned: number; expiring: number };
  content: { audios: number; hidden: number; episodes: number; failed: number };
  revenue: { total: number; last30: number; pending: number };
  engagement: { listenSeconds: number; favorites: number; messages: number; openTickets?: number };
  series: { date: string; users: number; revenue: number; listenSeconds?: number }[];
  topAudios: { id: number; title: string; thumbnailUrl?: string; plays: number; seconds: number }[];
  recentUsers: AdminUser[];
  recentOrders: AdminOrder[];
}

export interface BulkResult {
  success: number;
  failed: number;
  error?: string;
}

export interface SupportTicket {
  id: number;
  userId: number;
  username: string;
  kind: 'REFUND' | 'COMPLAINT' | string;
  category: string;
  orderCode?: string;
  bankInfo?: string;
  subject: string;
  content: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED' | string;
  adminNote?: string;
  resolvedBy?: number;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogItem {
  id: number;
  adminId: number;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  detail: string;
  createdAt: string;
}

export interface SiteConfig {
  freeImportDailyLimit: number;
  allowUserImport: boolean;
  allowGuestChat: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export interface StreamStatus {
  extractorReady: boolean;
  cacheEntries: number;
  streamOK: number;
  streamFailed: number;
  streamUnknown: number;
}

export interface BatchImportResponse {
  created: number;
  duplicate: number;
  failed: number;
  results: { url: string; status: string; title?: string; audioId?: number; error?: string }[];
}

export interface ImportStatsResponse {
  dailyLimit: number;
  allowUserImport: boolean;
  items: { userId: number; username: string; role: string; today: number; total: number }[];
}
