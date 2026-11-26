import { axiosClient } from '@/lib/axiosClient';
import type { AudioItem, Episode } from '@/types/audio';
import type {
  AdminAudio,
  AdminDashboard,
  AdminEpisodeRow,
  AdminOrder,
  AdminOrderList,
  AdminUser,
  AdminUserDetail,
  AuditLogItem,
  BatchImportResponse,
  BulkResult,
  ImportStatsResponse,
  Paged,
  SiteConfig,
  StreamStatus,
  SupportTicket,
} from '@/types/admin';

interface Envelope<T> {
  success: boolean;
  data: T;
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await axiosClient.get<Envelope<T>>(url, { params });
  return res.data.data;
}

async function send<T>(
  method: 'post' | 'patch' | 'put' | 'delete',
  url: string,
  body?: unknown
): Promise<T> {
  const res = await axiosClient.request<Envelope<T>>({ method, url, data: body });
  return res.data.data;
}

export const adminService = {
  dashboard: () => get<AdminDashboard>('/admin/dashboard'),

  users: (params: Record<string, unknown>) =>
    get<Paged<AdminUser>>('/admin/users', params),
  userDetail: (id: number) => get<AdminUserDetail>(`/admin/users/${id}`),
  createUser: (body: { username: string; email?: string; password: string; role?: string }) =>
    send<AdminUser>('post', '/admin/users', body),
  updateUser: (id: number, body: { username?: string; email?: string; role?: string }) =>
    send<AdminUser>('patch', `/admin/users/${id}`, body),
  deleteUser: (id: number) => send<{ deletedId: number }>('delete', `/admin/users/${id}`),
  grantVip: (id: number, days: number) => send<AdminUser>('post', `/admin/users/${id}/vip`, { days }),
  revokeVip: (id: number) => send<AdminUser>('delete', `/admin/users/${id}/vip`),
  ban: (id: number, reason: string) => send<AdminUser>('post', `/admin/users/${id}/ban`, { reason }),
  unban: (id: number) => send<AdminUser>('post', `/admin/users/${id}/unban`),
  resetPassword: (id: number, password: string) =>
    send<{ id: number }>('post', `/admin/users/${id}/password`, { password }),
  notifyUser: (id: number, body: { title: string; message: string; link?: string }) =>
    send<{ id: number }>('post', `/admin/users/${id}/notify`, body),
  bulkUsers: (body: { ids: number[]; action: string; days?: number; reason?: string }) =>
    send<BulkResult>('post', '/admin/users/bulk', body),

  orders: (params: Record<string, unknown>) => get<AdminOrderList>('/admin/orders', params),
  confirmOrder: (code: string) => send<AdminOrder>('post', `/admin/orders/${code}/confirm`),
  cancelOrder: (code: string) => send<AdminOrder>('post', `/admin/orders/${code}/cancel`),
  refundOrder: (code: string) => send<AdminOrder>('post', `/admin/orders/${code}/refund`),

  audios: (params: Record<string, unknown>) => get<Paged<AdminAudio>>('/admin/audios', params),
  bulkAudios: (body: {
    ids: number[];
    action: 'hide' | 'show' | 'vip' | 'free' | 'delete' | 'set_category' | 'add_tag';
    categoryId?: number;
    tag?: string;
  }) => send<{ updated: number }>('post', '/admin/audios/bulk', body),
  importBatch: (body: {
    urls: string[];
    categoryId: number;
    tags: string[];
    blockSizeSeconds: number;
    isVipOnly: boolean;
    freeEpisodesCount: number;
  }) => send<BatchImportResponse>('post', '/admin/audios/import-batch', body),
  checkStreamsBatch: (ids?: number[]) =>
    send<{ checked: number; ok: number; failed: number }>('post', '/admin/audios/check-streams', { ids }),
  importStats: () => get<ImportStatsResponse>('/admin/imports/stats'),

  audioEpisodes: (audioId: number) =>
    get<{ audio: AudioItem; items: AdminEpisodeRow[] }>(`/admin/audios/${audioId}/episodes`),
  batchChapters: (audioId: number, rawText: string) =>
    send<Episode[]>('post', `/admin/audios/${audioId}/episodes/batch-chapters`, { rawText }),
  bulkEpisodes: (body: {
    audioId?: number;
    ids?: number[];
    action: 'vip' | 'free' | 'delete' | 'renumber' | 'rename_prefix';
    prefix?: string;
  }) => send<{ updated: number }>('post', '/admin/episodes/bulk', body),

  tickets: (params: Record<string, unknown>) =>
    get<Paged<SupportTicket>>('/admin/tickets', params),
  updateTicket: (id: number, body: { status: string; adminNote?: string }) =>
    send<SupportTicket>('patch', `/admin/tickets/${id}`, body),

  auditLogs: (params: Record<string, unknown>) =>
    get<Paged<AuditLogItem>>('/admin/audit-logs', params),
  settings: () => get<SiteConfig>('/admin/settings'),
  updateSettings: (body: SiteConfig) => send<SiteConfig>('put', '/admin/settings', body),
  streamStatus: () => get<StreamStatus>('/admin/stream/status'),
  clearStreamCache: (videoId?: string) =>
    send<{ cleared: number }>('post', '/admin/stream/clear-cache', { videoId }),

  broadcast: (body: {
    title: string;
    message: string;
    link?: string;
    type?: 'SYSTEM' | 'PROMOTION';
    audience: 'all' | 'vip' | 'free' | 'admin';
  }) => send<{ targeted: number; delivered: number }>('post', '/admin/broadcast', body),

  async exportCsv(kind: 'users' | 'orders'): Promise<void> {
    const res = await axiosClient.get(`/admin/export/${kind}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wavelink-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
