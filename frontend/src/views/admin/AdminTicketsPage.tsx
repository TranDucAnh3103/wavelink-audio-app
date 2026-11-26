'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, Receipt, MessageSquare } from 'lucide-react';
import { api } from '@/services/api';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { cn } from '@/lib/utils';
import { errMessage, formatDateTime } from '@/lib/adminFormat';
import type { Paged, SupportTicket } from '@/types/admin';
import {
  AdminPage,
  EmptyBox,
  Field,
  FilterChips,
  PageTitle,
  SearchInput,
  Sheet,
  useDebounced,
} from '@/components/admin/AdminUI';

const PAGE_SIZE = 15;

const STATUS_META: Record<string, { label: string; badge: string }> = {
  PENDING: { label: 'Chờ xử lý', badge: 'badge-comic-yellow' },
  IN_PROGRESS: { label: 'Đang xử lý', badge: 'badge-comic-blue' },
  RESOLVED: { label: 'Đã giải quyết', badge: 'badge-comic-teal' },
  REJECTED: { label: 'Từ chối', badge: 'badge-comic-red' },
};

const STATUSES = ['ALL', 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];

export const AdminTicketsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status')?.toUpperCase() || 'ALL';
  const [status, setStatus] = useState(STATUSES.includes(initialStatus) ? initialStatus : 'ALL');
  const [kind, setKind] = useState('ALL');
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Paged<SupportTicket> | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<SupportTicket | null>(null);
  const [nextStatus, setNextStatus] = useState('RESOLVED');
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => setPage(1), [status, kind, q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.admin
      .tickets({ status, kind, q, page, pageSize: PAGE_SIZE })
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && toast.error(errMessage(err, 'Không thể tải yêu cầu')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, kind, q, page, reloadKey]);

  const openTicket = (t: SupportTicket) => {
    setEditing(t);
    setNextStatus(t.status === 'PENDING' ? 'RESOLVED' : t.status);
    setAdminNote(t.adminNote || '');
  };

  const saveTicket = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.admin.updateTicket(editing.id, { status: nextStatus, adminNote });
      toast.success('Đã cập nhật yêu cầu');
      setEditing(null);
      reload();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const items = data?.items || [];
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  return (
    <AdminPage active="tickets">
      <PageTitle title="Yêu cầu hỗ trợ" />

      <div className="flex gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm theo người dùng, tiêu đề, mã đơn" />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Loại yêu cầu"
          className="input-comic text-xs font-bold w-auto min-h-[44px] cursor-pointer"
        >
          <option value="ALL">Mọi loại</option>
          <option value="REFUND">Hoàn tiền</option>
          <option value="COMPLAINT">Khiếu nại</option>
        </select>
      </div>

      <FilterChips
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({
          key: s,
          label: s === 'ALL' ? 'Tất cả' : STATUS_META[s].label,
          count: data?.counts[s] ?? 0,
        }))}
      />

      {loading && !data ? (
        <AdminTableSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyBox text="Không có yêu cầu nào" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openTicket(t)}
                className="card-comic-sm card-comic-interactive p-3.5 bg-[var(--surface-card)] flex flex-col gap-2 text-left cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn('badge-comic text-[10px] py-0 px-1.5', t.kind === 'REFUND' ? 'badge-comic-orange' : 'badge-comic-purple')}>
                      {t.kind === 'REFUND' ? 'Hoàn tiền' : t.category || 'Khiếu nại'}
                    </span>
                    <span className={cn('badge-comic text-[10px] py-0 px-1.5', STATUS_META[t.status]?.badge)}>
                      {STATUS_META[t.status]?.label || t.status}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--ink-muted)] shrink-0">
                    {formatDateTime(t.createdAt)}
                  </span>
                </div>
                <span className="font-extrabold text-sm text-[var(--ink-primary)] line-clamp-1">
                  {t.subject}
                </span>
                <p className="text-xs font-medium text-[var(--ink-secondary)] line-clamp-2">
                  {t.content}
                </p>
                <span className="text-[11px] font-bold text-[var(--ink-muted)]">
                  {t.username}
                  {t.orderCode ? ` · Đơn #${t.orderCode}` : ''}
                </span>
              </button>
            ))}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={data?.total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <Sheet
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.subject || 'Chi tiết yêu cầu'}
        footer={
          <button
            type="button"
            disabled={saving}
            onClick={saveTicket}
            className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[44px]"
          >
            {saving ? 'Đang lưu...' : 'Cập nhật yêu cầu'}
          </button>
        }
      >
        {editing && (
          <>
            <div className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[var(--ink-primary)]">{editing.username}</span>
                <span className="text-[var(--ink-muted)]">{formatDateTime(editing.createdAt)}</span>
              </div>
              <p className="text-sm font-medium text-[var(--ink-primary)] whitespace-pre-wrap">
                {editing.content}
              </p>
              {editing.orderCode && (
                <span className="font-mono font-bold text-[var(--ink-secondary)]">
                  Mã đơn: #{editing.orderCode}
                </span>
              )}
              {editing.bankInfo && (
                <span className="font-semibold text-[var(--ink-secondary)]">
                  Tài khoản nhận hoàn: {editing.bankInfo}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {editing.userId > 0 && (
                <button
                  type="button"
                  onClick={() => navigate(`/admin/users?userId=${editing.userId}`)}
                  className="btn-comic text-xs py-2 px-3 min-h-[38px] flex-1 justify-center"
                >
                  <MessageSquare className="w-4 h-4" /> Xem người dùng
                </button>
              )}
              {editing.orderCode && (
                <button
                  type="button"
                  onClick={() => navigate(`/admin/orders?q=${encodeURIComponent(editing.orderCode || '')}`)}
                  className="btn-comic text-xs py-2 px-3 min-h-[38px] flex-1 justify-center"
                >
                  <Receipt className="w-4 h-4" /> Xem đơn hàng
                </button>
              )}
            </div>

            <Field label="Trạng thái xử lý">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { key: 'PENDING', label: 'Chờ xử lý', icon: Clock },
                  { key: 'IN_PROGRESS', label: 'Đang xử lý', icon: Clock },
                  { key: 'RESOLVED', label: 'Đã giải quyết', icon: CheckCircle2 },
                  { key: 'REJECTED', label: 'Từ chối', icon: XCircle },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setNextStatus(s.key)}
                    className={cn(
                      'btn-comic text-xs py-2 min-h-[40px] justify-center',
                      nextStatus === s.key && 'btn-comic-yellow'
                    )}
                  >
                    <s.icon className="w-3.5 h-3.5" /> {s.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Phản hồi gửi người dùng">
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Nội dung phản hồi hoặc ghi chú xử lý"
                className="input-comic text-sm resize-none"
              />
            </Field>
          </>
        )}
      </Sheet>
    </AdminPage>
  );
};
