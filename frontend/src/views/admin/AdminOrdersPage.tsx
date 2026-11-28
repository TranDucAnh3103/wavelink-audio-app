'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Download, RotateCcw, X } from 'lucide-react';
import { api } from '@/services/api';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { cn, formatVND } from '@/lib/utils';
import { errMessage, formatDateTime, ORDER_STATUS } from '@/lib/adminFormat';
import type { AdminOrder, AdminOrderList } from '@/types/admin';
import {
  AdminPage,
  EmptyBox,
  FilterChips,
  PageTitle,
  SearchInput,
  StatTile,
  useDebounced,
} from '@/components/admin/AdminUI';
import { Wallet, CalendarDays, Coins } from 'lucide-react';

const PAGE_SIZE = 15;
const STATUSES = ['ALL', 'PENDING', 'PAID', 'REFUNDED', 'CANCELLED', 'EXPIRED', 'FAILED'];

type Action = 'confirm' | 'cancel' | 'refund';
const ACTION_COPY: Record<Action, { title: string; text: string; confirm: string; danger?: boolean }> = {
  confirm: {
    title: 'Xác nhận đã thanh toán',
    text: 'Đánh dấu đơn đã thanh toán và kích hoạt VIP cho người dùng.',
    confirm: 'Xác nhận',
  },
  cancel: { title: 'Hủy đơn hàng', text: 'Đơn sẽ chuyển sang trạng thái đã hủy.', confirm: 'Hủy đơn', danger: true },
  refund: {
    title: 'Hoàn tiền đơn hàng',
    text: 'Đơn chuyển sang đã hoàn tiền và thời hạn VIP tương ứng bị trừ khỏi tài khoản.',
    confirm: 'Hoàn tiền',
    danger: true,
  },
};

export const AdminOrdersPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status')?.toUpperCase() || 'ALL';
  const [status, setStatus] = useState(STATUSES.includes(initialStatus) ? initialStatus : 'ALL');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const q = useDebounced(query);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminOrderList | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<{ order: AdminOrder; action: Action } | null>(null);

  useEffect(() => {
    const s = searchParams.get('status')?.toUpperCase();
    if (s && STATUSES.includes(s)) setStatus(s);
    const sq = searchParams.get('q');
    if (sq !== null) setQuery(sq);
  }, [searchParams]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => setPage(1), [status, q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.admin
      .orders({ status, q, page, pageSize: PAGE_SIZE })
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && toast.error(errMessage(err, 'Không thể tải đơn hàng')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, q, page, reloadKey]);

  const runAction = async () => {
    if (!pending) return false;
    const { order, action } = pending;
    try {
      if (action === 'confirm') await api.admin.confirmOrder(order.orderCode);
      else if (action === 'cancel') await api.admin.cancelOrder(order.orderCode);
      else await api.admin.refundOrder(order.orderCode);
      toast.success('Đã cập nhật đơn hàng');
      reload();
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    }
  };

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  return (
    <AdminPage active="orders">
      <PageTitle
        title="Đơn hàng"
        action={
          <button
            type="button"
            onClick={() => api.admin.exportCsv('orders').catch((err) => toast.error(errMessage(err)))}
            className="btn-comic text-xs py-2 px-3 min-h-[40px]"
          >
            <Download className="w-4 h-4" />
            <span>Xuất CSV</span>
          </button>
        }
      />

      {data && (
        <div className="grid grid-cols-3 gap-2.5">
          <StatTile label="Hôm nay" value={formatVND(data.revenue.today)} icon={CalendarDays} tone="yellow" />
          <StatTile label="30 ngày" value={formatVND(data.revenue.last30)} icon={Coins} tone="teal" />
          <StatTile label="Tổng" value={formatVND(data.revenue.total)} icon={Wallet} tone="purple" />
        </div>
      )}

      <SearchInput value={query} onChange={setQuery} placeholder="Tìm theo mã đơn, gói hoặc người dùng" />
      <FilterChips
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({
          key: s,
          label: s === 'ALL' ? 'Tất cả' : ORDER_STATUS[s].label,
          count: data?.counts[s] ?? 0,
        }))}
      />

      {loading && !data ? (
        <AdminTableSkeleton rows={5} />
      ) : !data || data.items.length === 0 ? (
        <EmptyBox text="Không có đơn hàng phù hợp" />
      ) : (
        <>
          <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-3', loading && 'opacity-60')}>
            {data.items.map((o) => {
              const canConfirm = o.status === 'PENDING';
              return (
                <div key={o.id} className="card-comic-sm p-3.5 bg-[var(--surface-card)] flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="font-extrabold text-sm text-[var(--ink-primary)] truncate">{o.username}</span>
                      <span className="text-[11px] font-mono font-semibold text-[var(--ink-muted)] truncate">
                        #{o.orderCode}
                      </span>
                    </div>
                    <span className={cn('badge-comic text-[10px] py-0.5 px-2 shrink-0', ORDER_STATUS[o.status]?.badge)}>
                      {ORDER_STATUS[o.status]?.label || o.status}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col text-xs font-semibold text-[var(--ink-secondary)]">
                      <span className="font-extrabold text-[var(--ink-primary)]">
                        {o.packageName} · {o.durationDays} ngày
                      </span>
                      <span>{formatDateTime(o.paidAt || o.createdAt)}</span>
                    </div>
                    <span className="font-comic font-black text-base text-[var(--ink-primary)]">{formatVND(o.amount)}</span>
                  </div>
                  {(canConfirm || o.status === 'PENDING' || o.status === 'PAID') && (
                    <div className="flex gap-2 pt-2 border-t border-[var(--border-ink)]/25">
                      {canConfirm && (
                        <button type="button" onClick={() => setPending({ order: o, action: 'confirm' })} className="btn-comic btn-comic-teal text-xs py-1.5 px-3 min-h-[38px] flex-1 justify-center">
                          <Check className="w-4 h-4" /> Xác nhận
                        </button>
                      )}
                      {o.status === 'PENDING' && (
                        <button type="button" onClick={() => setPending({ order: o, action: 'cancel' })} className="btn-comic text-xs py-1.5 px-3 min-h-[38px] flex-1 justify-center">
                          <X className="w-4 h-4" /> Hủy
                        </button>
                      )}
                      {o.status === 'PAID' && (
                        <button type="button" onClick={() => setPending({ order: o, action: 'refund' })} className="btn-comic btn-comic-red text-xs py-1.5 px-3 min-h-[38px] flex-1 justify-center">
                          <RotateCcw className="w-4 h-4" /> Hoàn tiền
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={data.total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      <Modal
        isOpen={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending ? ACTION_COPY[pending.action].title : ''}
        confirmText={pending ? ACTION_COPY[pending.action].confirm : undefined}
        isDanger={pending ? ACTION_COPY[pending.action].danger : false}
        size="sm"
        onConfirm={runAction}
      >
        {pending && (
          <>
            <p className="text-sm font-semibold">
              #{pending.order.orderCode} · {pending.order.username} · {formatVND(pending.order.amount)}
            </p>
            <p className="text-sm font-semibold text-[var(--ink-secondary)]">{ACTION_COPY[pending.action].text}</p>
          </>
        )}
      </Modal>
    </AdminPage>
  );
};
