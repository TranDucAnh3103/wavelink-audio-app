'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Crown,
  Ban,
  ShieldCheck,
  Clock,
  Headphones,
  Trash2,
  KeyRound,
  Send,
  UserPlus,
  Unlock,
  Heart,
  Upload,
  MessageSquare,
  Receipt,
  Download,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { formatVND, cn } from '@/lib/utils';
import {
  errMessage,
  formatDate,
  formatDateTime,
  formatListen,
  timeAgo,
  ORDER_STATUS,
} from '@/lib/adminFormat';
import type { AdminUser, AdminUserDetail, AdminUserFilter } from '@/types/admin';
import {
  AdminPage,
  Avatar,
  EmptyBox,
  Field,
  FilterChips,
  PageTitle,
  SearchInput,
  SelectBar,
  Sheet,
  Spinner,
  useDebounced,
} from '@/components/admin/AdminUI';

const PAGE_SIZE = 15;

const FILTERS: { key: AdminUserFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'vip', label: 'VIP' },
  { key: 'expiring', label: 'Sắp hết hạn' },
  { key: 'free', label: 'Miễn phí' },
  { key: 'admin', label: 'Quản trị' },
  { key: 'banned', label: 'Bị khóa' },
];

const VIP_PRESETS = [
  { days: 30, label: '30 ngày' },
  { days: 90, label: '3 tháng' },
  { days: 365, label: '1 năm' },
];

function roleTone(u: AdminUser): 'ADMIN' | 'VIP' | 'USER' {
  return u.role === 'ADMIN' ? 'ADMIN' : u.vipActive ? 'VIP' : 'USER';
}

const UserBadges: React.FC<{ u: AdminUser }> = ({ u }) => (
  <div className="flex items-center gap-1 flex-wrap">
    {u.role === 'ADMIN' && (
      <span className="badge-comic badge-comic-red text-[10px] py-0 px-1.5 font-black">ADMIN</span>
    )}
    {u.vipActive && (
      <span className="badge-comic badge-comic-purple text-[10px] py-0 px-1.5 font-black">
        <Crown className="w-2.5 h-2.5" /> VIP · {u.daysRemaining} ngày
      </span>
    )}
    {u.isBanned && (
      <span className="badge-comic badge-comic-red text-[10px] py-0 px-1.5 font-black">
        <Ban className="w-2.5 h-2.5" /> Bị khóa
      </span>
    )}
  </div>
);

export const AdminAccountsPage: React.FC = () => {
  const me = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = (searchParams.get('filter') as AdminUserFilter) || 'all';
  const validFilter: AdminUserFilter = FILTERS.some((f) => f.key === initialFilter)
    ? initialFilter
    : 'all';
  const urlUserId = searchParams.get('userId') ? Number(searchParams.get('userId')) : null;

  const [filter, setFilter] = useState<AdminUserFilter>(validFilter);
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(urlUserId);
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState<null | 'grant_vip' | 'revoke_vip' | 'ban' | 'unban' | 'delete'>(null);

  useEffect(() => {
    const f = searchParams.get('filter') as AdminUserFilter | null;
    if (f && FILTERS.some((x) => x.key === f)) setFilter(f);
    const uid = searchParams.get('userId');
    if (uid && Number(uid) > 0) setDetailId(Number(uid));
  }, [searchParams]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    setPage(1);
  }, [filter, q, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.admin
      .users({ filter, q, sort, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setUsers(res.items);
        setTotal(res.total);
        setCounts(res.counts);
      })
      .catch((err) => !cancelled && toast.error(errMessage(err, 'Không thể tải danh sách người dùng')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter, q, sort, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPage = users.length > 0 && users.every((u) => selected.has(u.id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) users.forEach((u) => next.delete(u.id));
      else users.forEach((u) => next.add(u.id));
      return next;
    });

  return (
    <AdminPage active="users">
      <PageTitle
        title="Người dùng"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => api.admin.exportCsv('users').catch((err) => toast.error(errMessage(err)))}
              aria-label="Xuất CSV"
              className="btn-comic text-xs py-2 px-2.5 min-h-[40px]"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-comic btn-comic-yellow text-xs py-2 px-3 min-h-[40px]"
            >
              <UserPlus className="w-4 h-4" strokeWidth={2.5} />
              <span>Thêm</span>
            </button>
          </div>
        }
      />

      <div className="flex gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm theo tên, email hoặc ID" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sắp xếp"
          className="input-comic text-xs font-bold w-auto min-h-[44px] cursor-pointer"
        >
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
          <option value="active">Hoạt động gần đây</option>
          <option value="name">Tên A-Z</option>
          <option value="expiry">Hết hạn VIP sớm</option>
        </select>
      </div>

      <FilterChips
        value={filter}
        onChange={(k) => setFilter(k as AdminUserFilter)}
        options={FILTERS.map((f) => ({ ...f, count: counts[f.key] }))}
      />

      {users.length > 0 && (
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--ink-secondary)] cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={allOnPage}
            onChange={toggleAll}
            className="w-4 h-4 accent-[#8338EC]"
          />
          Chọn tất cả trên trang
        </label>
      )}

      {loading && users.length === 0 ? (
        <AdminTableSkeleton rows={5} />
      ) : users.length === 0 ? (
        <EmptyBox text="Không có người dùng phù hợp" />
      ) : (
        <>
          <div className={cn('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3', loading && 'opacity-60')}>
            {users.map((u) => (
              <div
                key={u.id}
                className={cn(
                  'card-comic-sm p-3 bg-[var(--surface-card)] flex items-center gap-3',
                  selected.has(u.id) && 'ring-2 ring-[#8338EC]'
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggle(u.id)}
                  aria-label={`Chọn ${u.username}`}
                  className="w-5 h-5 accent-[#8338EC] shrink-0 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setDetailId(u.id)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <Avatar name={u.username} src={u.avatarUrl} tone={roleTone(u)} />
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="font-extrabold text-sm text-[var(--ink-primary)] truncate">
                      {u.username}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--ink-muted)] truncate">
                      {u.email && !u.email.endsWith('@user.local') ? u.email : `ID ${u.id}`}
                    </span>
                    <UserBadges u={u} />
                    <span className="text-[11px] font-semibold text-[var(--ink-muted)] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {timeAgo(u.lastLoginAt || u.createdAt)} ·{' '}
                      <Headphones className="w-3 h-3" /> {formatListen(u.listenSeconds)}
                    </span>
                  </div>
                </button>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      {selected.size > 0 && (
        <SelectBar count={selected.size} onClear={() => setSelected(new Set())}>
          <button type="button" className="btn-comic btn-comic-purple text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => setBulk('grant_vip')}>
            <Crown className="w-4 h-4" /> Cấp VIP
          </button>
          <button type="button" className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => setBulk('revoke_vip')}>
            Thu hồi VIP
          </button>
          <button type="button" className="btn-comic text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => setBulk('unban')}>
            <Unlock className="w-4 h-4" /> Mở khóa
          </button>
          <button type="button" className="btn-comic btn-comic-red text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => setBulk('ban')}>
            <Ban className="w-4 h-4" /> Khóa
          </button>
          <button type="button" className="btn-comic btn-comic-red text-xs py-1.5 px-3 min-h-[40px] shrink-0" onClick={() => setBulk('delete')}>
            <Trash2 className="w-4 h-4" /> Xóa
          </button>
        </SelectBar>
      )}

      <BulkDialog
        action={bulk}
        count={selected.size}
        onClose={() => setBulk(null)}
        onRun={async (extra) => {
          if (!bulk) return false;
          try {
            const res = await api.admin.bulkUsers({ ids: [...selected], action: bulk, ...extra });
            if (res.failed > 0) toast.error(`${res.success} thành công, ${res.failed} lỗi: ${res.error || ''}`);
            else toast.success(`Đã xử lý ${res.success} tài khoản`);
            setSelected(new Set());
            reload();
            return true;
          } catch (err) {
            toast.error(errMessage(err));
            return false;
          }
        }}
      />

      <CreateUserSheet
        isOpen={creating}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          reload();
        }}
      />

      <UserDetailSheet
        userId={detailId}
        selfId={me?.id}
        onClose={() => {
          setDetailId(null);
          if (searchParams.has('userId')) {
            const next = new URLSearchParams(searchParams);
            next.delete('userId');
            setSearchParams(next, { replace: true });
          }
        }}
        onChanged={reload}
      />
    </AdminPage>
  );
};

/* ------------------------------ Bulk dialog ------------------------------ */

const BULK_COPY: Record<string, { title: string; danger?: boolean; confirm: string }> = {
  grant_vip: { title: 'Cấp VIP hàng loạt', confirm: 'Cấp VIP' },
  revoke_vip: { title: 'Thu hồi VIP hàng loạt', confirm: 'Thu hồi' },
  ban: { title: 'Khóa tài khoản', danger: true, confirm: 'Khóa' },
  unban: { title: 'Mở khóa tài khoản', confirm: 'Mở khóa' },
  delete: { title: 'Xóa tài khoản', danger: true, confirm: 'Xóa vĩnh viễn' },
};

const BulkDialog: React.FC<{
  action: string | null;
  count: number;
  onClose: () => void;
  onRun: (extra: { days?: number; reason?: string }) => Promise<boolean>;
}> = ({ action, count, onClose, onRun }) => {
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState('');
  const copy = action ? BULK_COPY[action] : null;

  return (
    <Modal
      isOpen={Boolean(action)}
      onClose={onClose}
      title={copy?.title || ''}
      confirmText={copy?.confirm}
      isDanger={copy?.danger}
      size="sm"
      onConfirm={() => onRun(action === 'grant_vip' ? { days } : action === 'ban' ? { reason } : {})}
    >
      <p className="text-sm font-semibold text-[var(--ink-secondary)]">
        Áp dụng cho <strong className="text-[var(--ink-primary)]">{count}</strong> tài khoản đã chọn.
        {action === 'delete' && ' Dữ liệu nghe, yêu thích và thông báo của họ sẽ bị xóa.'}
      </p>
      {action === 'grant_vip' && <DaysPicker value={days} onChange={setDays} />}
      {action === 'ban' && (
        <Field label="Lý do (không bắt buộc)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input-comic text-sm" maxLength={200} />
        </Field>
      )}
    </Modal>
  );
};

const DaysPicker: React.FC<{ value: number; onChange: (n: number) => void }> = ({ value, onChange }) => (
  <div className="flex flex-col gap-2">
    <div className="flex gap-2 flex-wrap">
      {VIP_PRESETS.map((p) => (
        <button
          key={p.days}
          type="button"
          onClick={() => onChange(p.days)}
          className={cn('btn-comic text-xs py-1.5 px-3 min-h-[38px]', value === p.days && 'btn-comic-yellow')}
        >
          {p.label}
        </button>
      ))}
    </div>
    <Field label="Số ngày">
      <input
        type="number"
        min={1}
        max={3650}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
        className="input-comic text-sm font-mono"
      />
    </Field>
  </div>
);

/* ------------------------------ Create user ------------------------------ */

const CreateUserSheet: React.FC<{ isOpen: boolean; onClose: () => void; onDone: () => void }> = ({
  isOpen,
  onClose,
  onDone,
}) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('USER');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('USER');
    }
  }, [isOpen]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.admin.createUser({ username, email: email || undefined, password, role });
      toast.success('Đã tạo tài khoản');
      onDone();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Thêm người dùng"
      footer={
        <button
          type="button"
          disabled={busy || username.trim().length < 3 || password.length < 6}
          onClick={submit}
          className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[44px]"
        >
          {busy ? 'Đang tạo...' : 'Tạo tài khoản'}
        </button>
      }
    >
      <Field label="Tên tài khoản">
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="input-comic text-sm" autoComplete="off" />
      </Field>
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-comic text-sm" autoComplete="off" />
      </Field>
      <Field label="Mật khẩu">
        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="input-comic text-sm font-mono" autoComplete="off" />
      </Field>
      <Field label="Vai trò">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="input-comic text-sm font-bold cursor-pointer">
          <option value="USER">Người dùng</option>
          <option value="ADMIN">Quản trị viên</option>
        </select>
      </Field>
    </Sheet>
  );
};

/* ------------------------------ Detail sheet ------------------------------ */

type DetailTab = 'overview' | 'member' | 'manage';

const UserDetailSheet: React.FC<{
  userId: number | null;
  selfId?: number;
  onClose: () => void;
  onChanged: () => void;
}> = ({ userId, selfId, onClose, onChanged }) => {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'ban'>(null);

  const [days, setDays] = useState(30);
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const [role, setRole] = useState('USER');
  const [banReason, setBanReason] = useState('');
  const [newPass, setNewPass] = useState('');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const d = await api.admin.userDetail(userId);
      setDetail(d);
      setName(d.user.username);
      setMail(d.user.email && !d.user.email.endsWith('@user.local') ? d.user.email : '');
      setRole(d.user.role === 'ADMIN' ? 'ADMIN' : 'USER');
    } catch (err) {
      toast.error(errMessage(err));
      onClose();
    }
  }, [userId, onClose]);

  useEffect(() => {
    setDetail(null);
    setTab('overview');
    setNewPass('');
    setMsgTitle('');
    setMsgBody('');
    setBanReason('');
    if (userId) load();
  }, [userId, load]);

  const run = async (fn: () => Promise<unknown>, okMsg: string, close = false) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      onChanged();
      if (close) onClose();
      else await load();
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const u = detail?.user;
  const isSelf = u?.id === selfId;
  const isAdmin = u?.role === 'ADMIN';

  const tabs = useMemo(
    () => [
      { key: 'overview' as const, label: 'Hồ sơ' },
      { key: 'member' as const, label: 'Hội viên' },
      { key: 'manage' as const, label: 'Quản lý' },
    ],
    []
  );

  return (
    <Sheet isOpen={Boolean(userId)} onClose={onClose} title={u ? u.username : 'Người dùng'}>
      {!detail || !u ? (
        <Spinner />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar
              name={u.username}
              src={u.avatarUrl}
              tone={u.role === 'ADMIN' ? 'ADMIN' : detail.vipActive ? 'VIP' : 'USER'}
              size={52}
            />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-semibold text-[var(--ink-muted)] truncate">
                ID {u.id} · {u.email && !u.email.endsWith('@user.local') ? u.email : 'Chưa có email'}
              </span>
              <UserBadges u={{ ...u, vipActive: detail.vipActive, daysRemaining: detail.daysRemaining }} />
            </div>
          </div>

          {u.isBanned && (
            <div className="card-comic-sm p-2.5 bg-[#FFF1F2] dark:bg-[#2F161A] text-xs font-bold text-[#E63946]">
              Bị khóa từ {formatDate(u.bannedAt)}
              {u.banReason ? ` · ${u.banReason}` : ''}
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-muted)]">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'py-2 rounded-lg text-xs font-extrabold cursor-pointer min-h-[38px]',
                  tab === t.key ? 'bg-[#FFE600] text-[#111113] border-2 border-[#111113]' : 'text-[var(--ink-secondary)]'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: Headphones, label: 'Đã nghe', value: formatListen(detail.stats.listenSeconds) },
                  { icon: Heart, label: 'Yêu thích', value: detail.stats.favorites },
                  { icon: Upload, label: 'Audio đã nhập', value: detail.stats.uploads },
                  { icon: MessageSquare, label: 'Tin nhắn', value: detail.stats.messages },
                  { icon: Receipt, label: 'Đơn hàng', value: detail.stats.orders },
                  { icon: Crown, label: 'Đã chi', value: formatVND(detail.stats.paidTotal) },
                ].map((s) => (
                  <div key={s.label} className="card-comic-sm p-2.5 flex items-center gap-2 min-w-0">
                    <s.icon className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold uppercase text-[var(--ink-muted)]">{s.label}</span>
                      <span className="text-sm font-black text-[var(--ink-primary)] truncate">{s.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-xs font-semibold text-[var(--ink-secondary)] flex flex-col gap-1">
                <span>Tham gia: {formatDateTime(u.createdAt)}</span>
                <span>Đăng nhập gần nhất: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Chưa có'}</span>
                {u.googleId && <span>Liên kết Google</span>}
              </div>

              <SectionTitle>Đơn hàng gần đây</SectionTitle>
              {detail.orders.length === 0 ? (
                <span className="text-xs font-semibold text-[var(--ink-muted)]">Chưa có đơn hàng</span>
              ) : (
                detail.orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex flex-col min-w-0">
                      <span className="font-extrabold text-[var(--ink-primary)] truncate">{o.packageName}</span>
                      <span className="font-mono text-[11px] text-[var(--ink-muted)]">
                        #{o.orderCode} · {formatDate(o.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-black">{formatVND(o.amount)}</span>
                      <span className={cn('badge-comic text-[10px] py-0 px-1.5', ORDER_STATUS[o.status]?.badge)}>
                        {ORDER_STATUS[o.status]?.label || o.status}
                      </span>
                    </div>
                  </div>
                ))
              )}

              <SectionTitle>Nghe gần đây</SectionTitle>
              {detail.history.length === 0 ? (
                <span className="text-xs font-semibold text-[var(--ink-muted)]">Chưa có lịch sử nghe</span>
              ) : (
                detail.history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[var(--ink-primary)] truncate">
                      {h.title}
                      {h.episodeNumber ? ` · Tập ${h.episodeNumber}` : ''}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--ink-muted)] shrink-0">
                      {formatListen(h.durationListened)} · {timeAgo(h.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </>
          )}

          {tab === 'member' && (
            <>
              <div className="card-comic-sm p-3 flex flex-col gap-1">
                <span className="text-xs font-bold uppercase text-[var(--ink-muted)]">Trạng thái</span>
                <span className="font-black text-base text-[var(--ink-primary)]">
                  {isAdmin ? 'Quản trị viên' : detail.vipActive ? `VIP · còn ${detail.daysRemaining} ngày` : 'Miễn phí'}
                </span>
                {u.vipExpiresAt && (
                  <span className="text-xs font-semibold text-[var(--ink-secondary)]">
                    {detail.vipActive ? 'Hết hạn' : 'Đã hết hạn'}: {formatDate(u.vipExpiresAt)}
                  </span>
                )}
              </div>

              <SectionTitle>{detail.vipActive ? 'Gia hạn VIP' : 'Cấp VIP'}</SectionTitle>
              <DaysPicker value={days} onChange={setDays} />
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => api.admin.grantVip(u.id, days), `Đã cấp ${days} ngày VIP`)}
                className="btn-comic btn-comic-purple w-full justify-center text-sm py-2.5 min-h-[44px]"
              >
                <Crown className="w-4 h-4" /> {detail.vipActive ? 'Gia hạn' : 'Cấp VIP'} {days} ngày
              </button>
              {(detail.vipActive || u.vipExpiresAt) && !isAdmin && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => api.admin.revokeVip(u.id), 'Đã thu hồi VIP')}
                  className="btn-comic w-full justify-center text-sm py-2.5 min-h-[44px]"
                >
                  Thu hồi VIP
                </button>
              )}
            </>
          )}

          {tab === 'manage' && (
            <>
              <SectionTitle>Thông tin tài khoản</SectionTitle>
              <Field label="Tên tài khoản">
                <input value={name} onChange={(e) => setName(e.target.value)} className="input-comic text-sm" />
              </Field>
              <Field label="Email">
                <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} className="input-comic text-sm" />
              </Field>
              <Field label="Vai trò">
                <select
                  value={role}
                  disabled={isSelf}
                  onChange={(e) => setRole(e.target.value)}
                  className="input-comic text-sm font-bold cursor-pointer"
                >
                  <option value="USER">Người dùng</option>
                  <option value="ADMIN">Quản trị viên</option>
                </select>
              </Field>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      api.admin.updateUser(u.id, {
                        username: name,
                        email: mail || undefined,
                        role,
                      }),
                    'Đã lưu thông tin'
                  )
                }
                className="btn-comic btn-comic-primary w-full justify-center text-sm py-2.5 min-h-[44px]"
              >
                Lưu thông tin
              </button>

              <SectionTitle>Đặt lại mật khẩu</SectionTitle>
              <div className="flex gap-2">
                <input
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                  className="input-comic text-sm font-mono min-w-0"
                  autoComplete="off"
                />
                <button
                  type="button"
                  disabled={busy || newPass.length < 6}
                  onClick={async () => {
                    if (await run(() => api.admin.resetPassword(u.id, newPass), 'Đã đặt lại mật khẩu')) setNewPass('');
                  }}
                  className="btn-comic text-xs px-3 min-h-[44px] shrink-0"
                >
                  <KeyRound className="w-4 h-4" /> Đặt lại
                </button>
              </div>

              <SectionTitle>Gửi thông báo riêng</SectionTitle>
              <input value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} placeholder="Tiêu đề" className="input-comic text-sm" maxLength={200} />
              <textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder="Nội dung" rows={3} className="input-comic text-sm resize-none" maxLength={1000} />
              <button
                type="button"
                disabled={busy || !msgTitle.trim() || !msgBody.trim()}
                onClick={async () => {
                  if (await run(() => api.admin.notifyUser(u.id, { title: msgTitle, message: msgBody }), 'Đã gửi thông báo')) {
                    setMsgTitle('');
                    setMsgBody('');
                  }
                }}
                className="btn-comic w-full justify-center text-sm py-2.5 min-h-[44px]"
              >
                <Send className="w-4 h-4" /> Gửi
              </button>

              {!isSelf && !isAdmin && (
                <>
                  <SectionTitle>Vùng nguy hiểm</SectionTitle>
                  {u.isBanned ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => api.admin.unban(u.id), 'Đã mở khóa tài khoản')}
                      className="btn-comic btn-comic-teal w-full justify-center text-sm py-2.5 min-h-[44px]"
                    >
                      <Unlock className="w-4 h-4" /> Mở khóa tài khoản
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm('ban')}
                      className="btn-comic btn-comic-red w-full justify-center text-sm py-2.5 min-h-[44px]"
                    >
                      <Ban className="w-4 h-4" /> Khóa tài khoản
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm('delete')}
                    className="btn-comic btn-comic-red w-full justify-center text-sm py-2.5 min-h-[44px]"
                  >
                    <Trash2 className="w-4 h-4" /> Xóa tài khoản
                  </button>
                </>
              )}
              {isAdmin && !isSelf && (
                <span className="text-xs font-semibold text-[var(--ink-muted)] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Hạ quyền quản trị viên trước khi khóa hoặc xóa.
                </span>
              )}
            </>
          )}

          <Modal
            isOpen={confirm === 'ban'}
            onClose={() => setConfirm(null)}
            title="Khóa tài khoản"
            confirmText="Khóa"
            isDanger
            size="sm"
            onConfirm={() => run(() => api.admin.ban(u.id, banReason), 'Đã khóa tài khoản')}
          >
            <p className="text-sm font-semibold">
              {u.username} sẽ bị đăng xuất và không thể đăng nhập lại cho đến khi được mở khóa.
            </p>
            <Field label="Lý do (không bắt buộc)">
              <input value={banReason} onChange={(e) => setBanReason(e.target.value)} className="input-comic text-sm" maxLength={200} />
            </Field>
          </Modal>
          <Modal
            isOpen={confirm === 'delete'}
            onClose={() => setConfirm(null)}
            title="Xóa tài khoản"
            confirmText="Xóa vĩnh viễn"
            isDanger
            size="sm"
            onConfirm={() => run(() => api.admin.deleteUser(u.id), 'Đã xóa tài khoản', true)}
          >
            <p className="text-sm font-semibold">
              Xóa {u.username}? Lịch sử nghe, tiến độ, yêu thích và thông báo sẽ bị xóa vĩnh viễn.
            </p>
          </Modal>
        </>
      )}
    </Sheet>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="font-extrabold text-xs uppercase text-[var(--ink-primary)] pt-2 border-t border-[var(--border-ink)]/25">
    {children}
  </h4>
);
