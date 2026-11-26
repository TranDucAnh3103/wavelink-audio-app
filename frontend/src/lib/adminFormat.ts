export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return 'Chưa có';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Chưa có';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} ngày trước`;
  return formatDate(iso);
}

export function formatListen(seconds?: number): string {
  const s = seconds || 0;
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.round(s / 60)} phút`;
  return `${Math.round((s / 3600) * 10) / 10} giờ`;
}

export function compactVND(amount: number): string {
  const n = amount || 0;
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}tr`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export const ORDER_STATUS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'Chờ thanh toán', badge: 'badge-comic-yellow' },
  PAID: { label: 'Đã thanh toán', badge: 'badge-comic-teal' },
  CANCELLED: { label: 'Đã hủy', badge: 'badge-comic-white' },
  EXPIRED: { label: 'Hết hạn', badge: 'badge-comic-white' },
  FAILED: { label: 'Thất bại', badge: 'badge-comic-red' },
  REFUNDED: { label: 'Đã hoàn tiền', badge: 'badge-comic-orange' },
};

export function errMessage(err: unknown, fallback = 'Thao tác thất bại'): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: string }).message;
    if (m) return m;
  }
  return fallback;
}
