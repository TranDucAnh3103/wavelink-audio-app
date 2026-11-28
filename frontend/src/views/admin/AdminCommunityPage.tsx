'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare,
  Crown,
  UserCheck,
  Radio,
  Trash2,
  RefreshCw,
  Music2,
  Send,
  ShieldCheck,
  Ban,
  Users,
} from 'lucide-react';
import { api } from '@/services/api';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { triggerNotificationSync } from '@/hooks/useNotifications';
import { errMessage, formatDateTime } from '@/lib/adminFormat';
import { cn } from '@/lib/utils';
import type { CommunityAdminStats, CommunityMessage, WSCommunityMessage } from '@/types';
import {
  AdminPage,
  Avatar,
  EmptyBox,
  Field,
  PageTitle,
  SearchInput,
  Sheet,
  StatTile,
} from '@/components/admin/AdminUI';

const PAGE_SIZE = 20;

export const AdminCommunityPage: React.FC = () => {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [stats, setStats] = useState<CommunityAdminStats>({
    totalMessages: 0,
    onlineCount: 0,
    vipChatters: 0,
    guestChatters: 0,
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [deletingId, setDeletingId] = useState<number | string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<CommunityMessage | null>(null);
  const [banReason, setBanReason] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([api.community.getMessages({ all: true, limit: 200 }), api.community.getStats()]);
      setMessages([...list].reverse());
      setStats(s);
    } catch {
      toast.error('Không thể tải dữ liệu cộng đồng');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const disconnect = api.community.connectWebSocket((ws: WSCommunityMessage) => {
      if (ws.type === 'online_count' && typeof ws.count === 'number') {
        setStats((p) => ({ ...p, onlineCount: ws.count || 0 }));
      } else if (ws.type === 'new_message' && ws.data) {
        const m = ws.data as CommunityMessage;
        setMessages((p) => [m, ...p.filter((x) => String(x.id) !== String(m.id))]);
        setStats((p) => ({ ...p, totalMessages: p.totalMessages + 1 }));
      } else if (ws.type === 'delete_message' && ws.data) {
        const d = ws.data as { id: number | string };
        setMessages((p) => p.filter((x) => String(x.id) !== String(d.id)));
        setStats((p) => ({ ...p, totalMessages: Math.max(0, p.totalMessages - 1) }));
      } else if (ws.type === 'clear_messages') {
        setMessages([]);
        setStats((p) => ({ ...p, totalMessages: 0 }));
      }
    });
    return () => disconnect();
  }, [load]);

  useEffect(() => setPage(1), [query]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? messages.filter(
        (m) =>
          m.username.toLowerCase().includes(q) ||
          m.message.toLowerCase().includes(q) ||
          m.sharedAudio?.title?.toLowerCase().includes(q)
      )
    : messages;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const deleteMessage = async () => {
    if (deletingId === null) return false;
    try {
      await api.community.deleteMessage(deletingId);
      setMessages((p) => p.filter((m) => String(m.id) !== String(deletingId)));
      setStats((p) => ({ ...p, totalMessages: Math.max(0, p.totalMessages - 1) }));
      toast.success('Đã xóa tin nhắn');
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    }
  };

  const clearAll = async () => {
    try {
      await api.community.clearAllMessages();
      setMessages([]);
      setStats((p) => ({ ...p, totalMessages: 0 }));
      toast.success('Đã dọn sạch phòng chat');
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    }
  };

  const banSender = async () => {
    if (!banTarget) return false;
    try {
      await api.admin.ban(banTarget.userId, banReason);
      toast.success(`Đã khóa ${banTarget.username}`);
      setBanReason('');
      return true;
    } catch (err) {
      toast.error(errMessage(err));
      return false;
    }
  };

  const sendAnnouncement = async () => {
    const text = announcement.trim();
    if (!text) return;
    setSending(true);
    try {
      await api.community.sendMessage(`[THÔNG BÁO QUẢN TRỊ VIÊN] ${text}`, undefined, undefined, {
        throwOnError: true,
      });
      toast.success('Đã phát thông báo');
      triggerNotificationSync(true);
      setAnnouncement('');
      setComposeOpen(false);
      load();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminPage active="community">
      <PageTitle
        title="Cộng đồng"
        action={
          <div className="flex gap-2">
            <button type="button" onClick={load} disabled={loading} aria-label="Làm mới" className="btn-comic text-xs py-2 px-2.5 min-h-[40px]">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
            <button type="button" onClick={() => setComposeOpen(true)} className="btn-comic btn-comic-purple text-xs py-2 px-3 min-h-[40px]">
              <Radio className="w-4 h-4" />
              <span>Phát thông báo</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Tin nhắn" value={stats.totalMessages || messages.length} icon={MessageSquare} tone="blue" />
        <StatTile label="Đang online" value={stats.onlineCount} icon={Users} tone="teal" />
        <StatTile label="Người chat VIP" value={stats.vipChatters} icon={Crown} tone="purple" />
        <StatTile label="Khách chat" value={stats.guestChatters} icon={UserCheck} tone="yellow" />
      </div>

      <div className="flex gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm theo người gửi hoặc nội dung" />
        <button type="button" onClick={() => setClearOpen(true)} aria-label="Dọn sạch phòng chat" className="btn-comic btn-comic-red text-xs px-3 min-h-[44px] shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {loading && messages.length === 0 ? (
        <AdminTableSkeleton rows={4} />
      ) : paged.length === 0 ? (
        <EmptyBox text={q ? 'Không tìm thấy tin nhắn phù hợp' : 'Phòng chat chưa có tin nhắn'} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {paged.map((m) => {
            const isAdmin = m.role === 'ADMIN';
            const isGuest = m.role === 'GUEST' || m.userId === 0;
            const isVip = m.isVip || m.role === 'VIP';
            return (
              <div key={m.id} className="card-comic-sm p-3 bg-[var(--surface-card)] flex gap-3">
                <Avatar name={m.username} src={m.avatarUrl} tone={isAdmin ? 'ADMIN' : isVip ? 'VIP' : 'USER'} size={36} />
                <div className="flex flex-col min-w-0 flex-1 gap-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-sm text-[var(--ink-primary)]">{m.username}</span>
                    {isAdmin && (
                      <span className="badge-comic badge-comic-red text-[10px] py-0 px-1.5">
                        <ShieldCheck className="w-2.5 h-2.5" /> ADMIN
                      </span>
                    )}
                    {isVip && !isAdmin && <span className="badge-comic badge-comic-purple text-[10px] py-0 px-1.5">VIP</span>}
                    {isGuest && <span className="badge-comic badge-comic-white text-[10px] py-0 px-1.5">Khách</span>}
                    <span className="text-[11px] font-semibold text-[var(--ink-muted)] ml-auto">{formatDateTime(m.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-[var(--ink-primary)] whitespace-pre-wrap break-words">{m.message}</p>
                  {(m.sharedAudio || m.sharedAudioId) && (
                    <span className="text-xs font-bold text-[var(--ink-secondary)] flex items-center gap-1.5 truncate">
                      <Music2 className="w-3.5 h-3.5 text-[#3A86FF] shrink-0" />
                      <span className="truncate">{m.sharedAudio?.title || `Audio #${m.sharedAudioId}`}</span>
                    </span>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setDeletingId(m.id)} className="btn-comic btn-comic-red text-xs py-1 px-2.5 min-h-[34px]">
                      <Trash2 className="w-3.5 h-3.5" /> Xóa
                    </button>
                    {m.userId > 0 && !isAdmin && (
                      <button type="button" onClick={() => setBanTarget(m)} className="btn-comic text-xs py-1 px-2.5 min-h-[34px]">
                        <Ban className="w-3.5 h-3.5" /> Khóa người gửi
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination currentPage={safePage} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <Modal isOpen={deletingId !== null} onClose={() => setDeletingId(null)} title="Xóa tin nhắn" confirmText="Xóa" isDanger size="sm" onConfirm={deleteMessage}>
        <p className="text-sm font-semibold">Tin nhắn sẽ biến mất ngay với mọi người đang online.</p>
      </Modal>

      <Modal isOpen={clearOpen} onClose={() => setClearOpen(false)} title="Dọn sạch phòng chat" confirmText="Xóa toàn bộ" isDanger size="sm" onConfirm={clearAll}>
        <p className="text-sm font-semibold">Toàn bộ lịch sử tin nhắn sẽ bị xóa vĩnh viễn.</p>
      </Modal>

      <Modal
        isOpen={Boolean(banTarget)}
        onClose={() => setBanTarget(null)}
        title="Khóa người gửi"
        confirmText="Khóa tài khoản"
        isDanger
        size="sm"
        onConfirm={banSender}
      >
        <p className="text-sm font-semibold">{banTarget?.username} sẽ bị đăng xuất và không thể đăng nhập cho đến khi được mở khóa.</p>
        <Field label="Lý do (không bắt buộc)">
          <input value={banReason} onChange={(e) => setBanReason(e.target.value)} maxLength={200} className="input-comic text-sm" />
        </Field>
      </Modal>

      <Sheet
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Phát thông báo vào phòng chat"
        footer={
          <button
            type="button"
            onClick={sendAnnouncement}
            disabled={sending || !announcement.trim()}
            className="btn-comic btn-comic-purple w-full justify-center text-sm py-2.5 min-h-[44px]"
          >
            <Send className="w-4 h-4" /> {sending ? 'Đang gửi...' : 'Phát ngay'}
          </button>
        }
      >
        <textarea
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
          rows={4}
          maxLength={900}
          className="input-comic text-sm resize-none"
          placeholder="Nội dung thông báo"
        />
      </Sheet>
    </AdminPage>
  );
};
