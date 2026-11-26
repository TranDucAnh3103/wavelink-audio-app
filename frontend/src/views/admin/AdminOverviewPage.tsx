'use client';

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Crown,
  Wallet,
  Headphones,
  BookOpen,
  Scissors,
  Heart,
  MessageSquare,
  Receipt,
  Clock,
  AlertTriangle,
  Ban,
  ChevronRight,
  Plus,
  Bell,
  LifeBuoy,
} from 'lucide-react';
import { api } from '@/services/api';
import { toast } from '@/components/ui/Toast';
import { AdminOverviewSkeleton } from '@/components/common/Skeletons';
import { formatVND } from '@/lib/utils';
import { compactVND, errMessage, formatListen, ORDER_STATUS, timeAgo } from '@/lib/adminFormat';
import type { AdminDashboard } from '@/types/admin';
import { AdminPage, Avatar, PageTitle, StatTile } from '@/components/admin/AdminUI';
import { cn } from '@/lib/utils';

const Bars: React.FC<{
  data: { date: string; value: number }[];
  color: string;
  format: (n: number) => string;
}> = ({ data, color, format }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-comic font-black text-lg text-[var(--ink-primary)]">{format(total)}</span>
      <div className="flex items-end gap-1 h-24" role="img" aria-label="Biểu đồ 14 ngày">
        {data.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${d.date}: ${format(d.value)}`}>
            <div
              className="w-full rounded-t-md border-2 border-[#111113]"
              style={{
                height: `${Math.max(d.value ? 8 : 3, (d.value / max) * 100)}%`,
                background: d.value ? color : 'var(--surface-muted)',
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-bold text-[var(--ink-muted)]">
        <span>{data[0]?.date.slice(5).replace('-', '/')}</span>
        <span>{data[data.length - 1]?.date.slice(5).replace('-', '/')}</span>
      </div>
    </div>
  );
};

const Alert: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  tone: string;
  onClick: () => void;
}> = ({ icon: Icon, text, tone, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="card-comic-sm card-comic-interactive p-3 flex items-center gap-3 text-left cursor-pointer w-full"
  >
    <div className={cn('w-9 h-9 rounded-lg border-2 border-[#111113] flex items-center justify-center shrink-0', tone)}>
      <Icon className="w-4 h-4" />
    </div>
    <span className="flex-1 text-sm font-extrabold text-[var(--ink-primary)]">{text}</span>
    <ChevronRight className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
  </button>
);

export const AdminOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .dashboard()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && toast.error(errMessage(err, 'Không thể tải tổng quan')));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <AdminPage active="overview">
        <AdminOverviewSkeleton />
      </AdminPage>
    );
  }

  const alerts = [
    data.revenue.pending > 0 && {
      icon: Receipt,
      tone: 'bg-[#FFE600] text-[#111113]',
      text: `${data.revenue.pending} đơn đang chờ thanh toán`,
      to: '/admin/orders?status=PENDING',
    },
    data.users.expiring > 0 && {
      icon: Clock,
      tone: 'bg-[#F4A261] text-[#111113]',
      text: `${data.users.expiring} VIP sắp hết hạn trong 7 ngày`,
      to: '/admin/users?filter=expiring',
    },
    data.content.failed > 0 && {
      icon: AlertTriangle,
      tone: 'bg-[#E63946] text-white',
      text: `${data.content.failed} audio lỗi luồng phát`,
      to: '/admin/audios?filter=failed',
    },
    (data.engagement.openTickets || 0) > 0 && {
      icon: LifeBuoy,
      tone: 'bg-[#3A86FF] text-white',
      text: `${data.engagement.openTickets} yêu cầu hỗ trợ chờ xử lý`,
      to: '/admin/tickets?status=PENDING',
    },
    data.users.banned > 0 && {
      icon: Ban,
      tone: 'bg-[#E5E7EB] text-[#111113]',
      text: `${data.users.banned} tài khoản đang bị khóa`,
      to: '/admin/users?filter=banned',
    },
  ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; tone: string; text: string; to: string }[];

  return (
    <AdminPage active="overview">
      <PageTitle
        title="Tổng quan"
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate('/admin/notify')} className="btn-comic text-xs py-2 px-3 min-h-[40px]">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Thông báo</span>
            </button>
            <button type="button" onClick={() => navigate('/upload')} className="btn-comic btn-comic-yellow text-xs py-2 px-3 min-h-[40px]">
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span>Thêm audio</span>
            </button>
          </div>
        }
      />

      {alerts.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {alerts.map((a) => (
            <Alert key={a.text} icon={a.icon} tone={a.tone} text={a.text} onClick={() => navigate(a.to)} />
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Người dùng" value={data.users.total} sub={`+${data.users.new7d} trong 7 ngày`} icon={Users} tone="blue" onClick={() => navigate('/admin/users')} />
        <StatTile label="VIP hoạt động" value={data.users.vip} icon={Crown} tone="purple" onClick={() => navigate('/admin/users?filter=vip')} />
        <StatTile label="Doanh thu 30 ngày" value={formatVND(data.revenue.last30)} sub={`Tổng ${formatVND(data.revenue.total)}`} icon={Wallet} tone="teal" onClick={() => navigate('/admin/orders')} />
        <StatTile label="Giờ nghe" value={formatListen(data.engagement.listenSeconds)} icon={Headphones} tone="yellow" />
        <StatTile label="Audio" value={data.content.audios} sub={data.content.hidden ? `${data.content.hidden} đang ẩn` : undefined} icon={BookOpen} tone="orange" onClick={() => navigate('/admin/audios')} />
        <StatTile label="Tập" value={data.content.episodes} icon={Scissors} tone="teal" onClick={() => navigate('/admin/episodes')} />
        <StatTile label="Yêu thích" value={data.engagement.favorites} icon={Heart} tone="red" />
        <StatTile label="Tin nhắn" value={data.engagement.messages} icon={MessageSquare} tone="blue" onClick={() => navigate('/admin/community')} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card-comic p-4 flex flex-col gap-2">
          <h2 className="font-extrabold text-xs uppercase text-[var(--ink-muted)]">Doanh thu 14 ngày</h2>
          <Bars
            data={data.series.map((s) => ({ date: s.date, value: s.revenue }))}
            color="#2A9D8F"
            format={(n) => (n >= 1000 ? `${compactVND(n)}đ` : `${n}đ`)}
          />
        </div>
        <div className="card-comic p-4 flex flex-col gap-2">
          <h2 className="font-extrabold text-xs uppercase text-[var(--ink-muted)]">Người dùng mới 14 ngày</h2>
          <Bars data={data.series.map((s) => ({ date: s.date, value: s.users }))} color="#3A86FF" format={(n) => String(n)} />
        </div>
        <div className="card-comic p-4 flex flex-col gap-2">
          <h2 className="font-extrabold text-xs uppercase text-[var(--ink-muted)]">Thời lượng nghe 14 ngày</h2>
          <Bars
            data={data.series.map((s) => ({ date: s.date, value: s.listenSeconds || 0 }))}
            color="#8338EC"
            format={(n) => formatListen(n)}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card-comic p-4 flex flex-col gap-2.5">
          <h2 className="font-extrabold text-xs uppercase text-[var(--ink-muted)]">Nghe nhiều nhất</h2>
          {data.topAudios.length === 0 ? (
            <span className="text-sm font-semibold text-[var(--ink-muted)]">Chưa có dữ liệu</span>
          ) : (
            data.topAudios.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/player/${a.id}`)}
                className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 cursor-pointer"
              >
                <span className="w-6 h-6 rounded-md bg-[#FFE600] border-2 border-[#111113] text-[11px] font-black flex items-center justify-center shrink-0 text-[#111113]">
                  {i + 1}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-extrabold text-[var(--ink-primary)] truncate">{a.title}</span>
                  <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                    {a.plays} lượt · {formatListen(a.seconds)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="card-comic p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-xs uppercase text-[var(--ink-muted)]">Người dùng mới</h2>
            <button type="button" onClick={() => navigate('/admin/users')} className="text-xs font-extrabold text-[#3A86FF] cursor-pointer">
              Xem tất cả
            </button>
          </div>
          {data.recentUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => navigate(`/admin/users?userId=${u.id}`)}
              className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 cursor-pointer"
            >
              <Avatar name={u.username} src={u.avatarUrl} size={34} />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-extrabold text-[var(--ink-primary)] truncate">{u.username}</span>
                <span className="text-[11px] font-semibold text-[var(--ink-muted)]">{timeAgo(u.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="card-comic p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-xs uppercase text-[var(--ink-muted)]">Đơn hàng gần đây</h2>
            <button type="button" onClick={() => navigate('/admin/orders')} className="text-xs font-extrabold text-[#3A86FF] cursor-pointer">
              Xem tất cả
            </button>
          </div>
          {data.recentOrders.length === 0 ? (
            <span className="text-sm font-semibold text-[var(--ink-muted)]">Chưa có đơn hàng</span>
          ) : (
            data.recentOrders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => navigate(`/admin/orders?q=${encodeURIComponent(o.orderCode)}`)}
                className="flex items-center justify-between gap-2 min-w-0 text-left hover:opacity-80 cursor-pointer"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-extrabold text-[var(--ink-primary)] truncate">{o.username}</span>
                  <span className="text-[11px] font-semibold text-[var(--ink-muted)] truncate">
                    {o.packageName} · {timeAgo(o.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-sm font-black">{formatVND(o.amount)}</span>
                  <span className={cn('badge-comic text-[10px] py-0 px-1.5', ORDER_STATUS[o.status]?.badge)}>
                    {ORDER_STATUS[o.status]?.label || o.status}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </AdminPage>
  );
};
