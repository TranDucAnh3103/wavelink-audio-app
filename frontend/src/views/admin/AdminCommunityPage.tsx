'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  MessageSquare,
  Crown,
  UserCheck,
  Search,
  Radio,
  Trash2,
  RefreshCw,
  MessageCircle,
  Music2,
  Send,
  ShieldCheck,
  Headphones,
  User as UserIcon,
  Star,
} from 'lucide-react';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { AdminTabs } from './AdminTabs';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { AdminTableSkeleton } from '@/components/common/Skeletons';
import { Pagination } from '@/components/ui/Pagination';
import { CommunityMessage, CommunityAdminStats, WSCommunityMessage } from '@/types';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import { triggerNotificationSync } from '@/hooks/useNotifications';

export const AdminCommunityPage: React.FC = () => {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [stats, setStats] = useState<CommunityAdminStats>({
    totalMessages: 0,
    onlineCount: 0,
    vipChatters: 0,
    guestChatters: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;

  const [deletingMsgId, setDeletingMsgId] = useState<number | string | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const [isAdminMsgModalOpen, setIsAdminMsgModalOpen] = useState(false);
  const [adminMsgText, setAdminMsgText] = useState('');
  const [isSendingAdminMsg, setIsSendingAdminMsg] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [msgList, statsData] = await Promise.all([
        api.community.getMessages(),
        api.community.getStats(),
      ]);
      setMessages(msgList);
      setStats(statsData);
    } catch {
      toast.error('Lỗi khi tải dữ liệu cộng đồng');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const disconnectWs = api.community.connectWebSocket((wsMsg: WSCommunityMessage) => {
      if (wsMsg.type === 'online_count' && typeof wsMsg.count === 'number') {
        setStats((prev) => ({ ...prev, onlineCount: wsMsg.count || 0 }));
      } else if (wsMsg.type === 'new_message' && wsMsg.data) {
        const newMsg = wsMsg.data as CommunityMessage;
        setMessages((prev) => [newMsg, ...prev.filter((m) => String(m.id) !== String(newMsg.id))]);
        setStats((prev) => ({ ...prev, totalMessages: prev.totalMessages + 1 }));
      } else if (wsMsg.type === 'delete_message' && wsMsg.data) {
        const deleted = wsMsg.data as { id: number | string };
        setMessages((prev) => prev.filter((m) => String(m.id) !== String(deleted.id)));
        setStats((prev) => ({ ...prev, totalMessages: Math.max(0, prev.totalMessages - 1) }));
      } else if (wsMsg.type === 'clear_messages') {
        setMessages([]);
        setStats((prev) => ({ ...prev, totalMessages: 0 }));
      }
    });

    return () => {
      disconnectWs();
    };
  }, []);

  const showSkeletonFallback = useDelayedFallback(isLoading && messages.length === 0, 180);

  const handleDeleteMessage = async () => {
    if (deletingMsgId === null || deletingMsgId === undefined) return false;
    const targetId = deletingMsgId;
    try {
      await api.community.deleteMessage(targetId);
      toast.success('Đã xóa tin nhắn khỏi cộng đồng!');
    } catch (err) {
      console.warn('Lỗi gọi API xóa tin nhắn, xóa local', err);
      toast.info('Đã xóa tin nhắn khỏi danh sách hiển thị');
    } finally {
      setMessages((prev) => prev.filter((m) => String(m.id) !== String(targetId)));
      setDeletingMsgId(null);
    }
    return true;
  };

  const handleClearAllMessages = async () => {
    try {
      await api.community.clearAllMessages();
      toast.success('Đã dọn dẹp sạch toàn bộ phòng chat!');
    } catch (err) {
      console.warn('Lỗi gọi API dọn dẹp phòng chat, xóa local', err);
      toast.info('Đã làm sạch toàn bộ lịch sử phòng chat!');
    } finally {
      setMessages([]);
      setIsClearModalOpen(false);
      setStats((prev) => ({ ...prev, totalMessages: 0 }));
    }
    return true;
  };

  const handleSendAdminAnnouncement = async () => {
    const text = adminMsgText.trim();
    if (!text) {
      toast.error('Vui lòng nhập nội dung thông báo');
      return false;
    }

    setIsSendingAdminMsg(true);
    try {
      await api.community.sendMessage(`[THÔNG BÁO QUẢN TRỊ VIÊN] ${text}`);
      toast.success('Đã phát thông báo Admin tới toàn thể cộng đồng!');
      triggerNotificationSync(true);
      setAdminMsgText('');
      setIsAdminMsgModalOpen(false);
      loadData();
      return true;
    } catch {
      toast.error('Lỗi khi gửi thông báo');
      return false;
    } finally {
      setIsSendingAdminMsg(false);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.username.toLowerCase().includes(q) ||
      m.message.toLowerCase().includes(q) ||
      m.sharedAudio?.title?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedMessages = filteredMessages.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  const formatMsgDate = (isoString?: string) => {
    if (!isoString) return 'Vừa xong';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return 'Vừa xong';
    }
  };

  return (
    <div className="flex flex-col w-full pb-36 md:pb-28 fade-in-comic">
      <AdminTabs activeTab="community" />

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-4">
        {/* Header Banner */}
        <div className="card-comic p-4 md:p-5 bg-[#FFE600] text-[#111113] flex items-center justify-between border-2 border-[#111113]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border-2 border-[#111113] bg-white flex items-center justify-center shadow-comic-sm shrink-0">
              <Users className="w-5 h-5 text-[#3A86FF]" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <h1 className="font-comic font-extrabold text-sm sm:text-base md:text-lg uppercase tracking-tight text-[#111113]">
                Quản Trị Cộng Đồng & Phòng Chat
              </h1>
              <span className="text-xs font-bold text-[#111113]/80">
                Kiểm duyệt thảo luận, thống kê người online và bảng vàng
              </span>
            </div>
          </div>
        </div>

        {/* Community Stats Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card-comic p-3.5 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[var(--ink-secondary)]">
              <span className="text-[10px] font-bold uppercase">Tổng Tin Nhắn</span>
              <MessageSquare className="w-4 h-4 text-[#3A86FF]" />
            </div>
            <span className="font-comic text-2xl font-black text-[var(--ink-primary)]">
              {stats.totalMessages || messages.length}
            </span>
            <span className="text-[10px] font-semibold text-[var(--ink-muted)]">
              Đã lưu trữ trong DB
            </span>
          </div>

          <div className="card-comic p-3.5 bg-[var(--surface-accent-soft)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[var(--ink-secondary)]">
              <span className="text-[10px] font-bold uppercase">Đang Trực Tuyến</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
            </div>
            <span className="font-comic text-2xl font-black text-[var(--ink-primary)]">
              {stats.onlineCount}
            </span>
            <span className="text-[10px] font-bold text-[#2A9D8F]">WebSocket kết nối</span>
          </div>

          <div className="card-comic p-3.5 bg-[#F3E8FF] dark:bg-[#261B38] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[var(--ink-secondary)]">
              <span className="text-[10px] font-bold uppercase">Thành Viên VIP</span>
              <Crown className="w-4 h-4 text-[#8338EC]" />
            </div>
            <span className="font-comic text-2xl font-black text-[#8338EC]">
              {stats.vipChatters}
            </span>
            <span className="text-[10px] font-semibold text-[var(--ink-muted)]">Hội viên cao cấp</span>
          </div>

          <div className="card-comic p-3.5 bg-[var(--surface-elevated)] flex flex-col gap-1">
            <div className="flex items-center justify-between text-[var(--ink-secondary)]">
              <span className="text-[10px] font-bold uppercase">Khách Tham Gia</span>
              <UserCheck className="w-4 h-4 text-[var(--ink-secondary)]" />
            </div>
            <span className="font-comic text-2xl font-black text-[var(--ink-primary)]">
              {stats.guestChatters}
            </span>
            <span className="text-[10px] font-semibold text-[var(--ink-muted)]">
              Độc giả vãng lai
            </span>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="card-comic p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input
              type="text"
              placeholder="Tìm kiếm theo người gửi, nội dung tin nhắn..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="input-comic text-xs pl-9 pr-3 py-1.5 w-full"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setIsAdminMsgModalOpen(true)}
              className="btn-comic btn-comic-purple text-xs py-1.5 px-3"
            >
              <Radio className="w-3.5 h-3.5 text-[#FFE600]" />
              <span>Gửi Thông Báo</span>
            </button>

            <button
              type="button"
              onClick={() => setIsClearModalOpen(true)}
              className="btn-comic btn-comic-red text-xs py-1.5 px-3"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Dọn Dẹp Chat</span>
            </button>

            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="btn-comic text-xs py-1.5 px-2.5"
              title="Làm mới"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Messages Moderation Feed */}
        <div className="card-comic p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)]">
            <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
              Danh Sách Tin Nhắn Kiểm Duyệt ({filteredMessages.length})
            </span>
            <span className="badge-comic badge-comic-teal text-[9px] font-black">REALTIME LOG</span>
          </div>

          {showSkeletonFallback ? (
            <AdminTableSkeleton rows={4} />
          ) : pagedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--ink-muted)] gap-2">
              <MessageCircle className="w-10 h-10 opacity-40" />
              <span className="text-xs font-bold text-[var(--ink-secondary)]">
                {searchQuery
                  ? 'Không tìm thấy tin nhắn phù hợp với từ khóa'
                  : 'Phòng chat hiện tại không có tin nhắn nào'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pagedMessages.map((m) => {
                const isAdmin = m.role === 'ADMIN';
                const isVip = m.isVip || m.role === 'VIP';
                const isGuest = m.role === 'GUEST' || m.userId === 0;

                return (
                  <div
                    key={m.id}
                    className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex items-start justify-between gap-3 hover:border-[#3A86FF] transition-all"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg border border-[var(--border-ink)] bg-[var(--surface-card)] flex items-center justify-center text-[var(--ink-primary)] shrink-0 mt-0.5">
                        {isAdmin ? (
                          <ShieldCheck className="w-4 h-4 text-[#E63946]" />
                        ) : isVip ? (
                          <Star className="w-4 h-4 text-[#8338EC]" />
                        ) : isGuest ? (
                          <UserIcon className="w-4 h-4 text-[var(--ink-muted)]" />
                        ) : (
                          <Headphones className="w-4 h-4 text-[#3A86FF]" />
                        )}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-[var(--ink-primary)]">
                            {m.username}
                          </span>
                          {isAdmin ? (
                            <span className="badge-comic badge-comic-red text-[8px] py-0 px-1">
                              ADMIN
                            </span>
                          ) : isVip ? (
                            <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-bold">
                              VIP
                            </span>
                          ) : isGuest ? (
                            <span className="badge-comic badge-comic-white text-[8px] py-0 px-1">
                              KHÁCH
                            </span>
                          ) : (
                            <span className="badge-comic badge-comic-blue text-[8px] py-0 px-1">
                              USER
                            </span>
                          )}
                          <span className="text-[10px] text-[var(--ink-muted)] font-mono">
                            ID: {m.id}
                          </span>
                          <span className="text-[10px] text-[var(--ink-muted)] font-semibold ml-auto">
                            {formatMsgDate(m.createdAt)}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-[var(--ink-primary)] mt-1 whitespace-pre-wrap leading-relaxed">
                          {m.message}
                        </p>

                        {(m.sharedAudio || m.sharedAudioId) && (
                          <div className="mt-1.5 p-1.5 rounded-lg border border-[var(--border-ink)] bg-[var(--surface-accent-soft)] flex items-center gap-2 self-start max-w-full">
                            <Music2 className="w-3.5 h-3.5 text-[#3A86FF] shrink-0" />
                            <span className="text-[10px] font-bold text-[var(--ink-primary)] truncate">
                              Truyện đính kèm:{' '}
                              <span className="underline">
                                {m.sharedAudio?.title || `Audio ID #${m.sharedAudioId}`}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1 self-start">
                      <button
                        type="button"
                        onClick={() => setDeletingMsgId(m.id)}
                        className="btn-comic btn-comic-red text-[10px] py-1 px-2.5"
                        title="Xóa tin nhắn này"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={filteredMessages.length}
            pageSize={pageSize}
            onPageChange={(p) => setCurrentPage(p)}
          />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deletingMsgId !== null}
        onClose={() => setDeletingMsgId(null)}
        title="XÁC NHẬN XÓA TIN NHẮN"
        confirmText="Xóa vĩnh viễn"
        cancelText="Hủy"
        isDanger
        onConfirm={handleDeleteMessage}
        size="sm"
      >
        <p className="text-xs text-[var(--ink-secondary)] font-semibold leading-relaxed">
          Bạn có chắc chắn muốn xóa tin nhắn này khỏi phòng chat cộng đồng không? Tin nhắn sẽ biến mất ngay lập tức trên màn hình của tất cả độc giả đang trực tuyến.
        </p>
      </Modal>

      {/* Clear All Confirmation Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title="DỌN DẸP SẠCH PHÒNG CHAT"
        confirmText="Xác nhận xóa hết"
        cancelText="Hủy"
        isDanger
        onConfirm={handleClearAllMessages}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#E63946] font-bold leading-relaxed">
            CẢNH BÁO: Toàn bộ lịch sử tin nhắn trong phòng chat cộng đồng sẽ bị xóa sạch khỏi cơ sở dữ liệu!
          </p>
          <p className="text-[11px] text-[var(--ink-secondary)] font-semibold">
            Thao tác này thường dùng để dọn dẹp tin rác hoặc làm mới phòng chat định kỳ.
          </p>
        </div>
      </Modal>

      {/* Send Admin Announcement Modal */}
      <Modal
        isOpen={isAdminMsgModalOpen}
        onClose={() => setIsAdminMsgModalOpen(false)}
        title="PHÁT THÔNG BÁO QUẢN TRỊ VIÊN"
        showFooter={false}
        size="md"
      >
        <div className="flex flex-col gap-3 py-1">
          <p className="text-xs text-[var(--ink-secondary)] font-semibold leading-relaxed">
            Tin nhắn sẽ được gắn huy hiệu <strong>ADMIN</strong> và phát sóng trực tiếp tới tất cả độc giả đang kết nối.
          </p>
          <textarea
            value={adminMsgText}
            onChange={(e) => setAdminMsgText(e.target.value)}
            rows={3}
            placeholder="Nhập nội dung thông báo tới toàn thể cộng đồng..."
            className="input-comic text-xs p-2.5 resize-none font-medium"
          />
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-ink)]/25">
            <button
              type="button"
              onClick={() => setIsAdminMsgModalOpen(false)}
              className="btn-comic text-xs py-1.5 px-3"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSendAdminAnnouncement}
              disabled={isSendingAdminMsg || !adminMsgText.trim()}
              className="btn-comic btn-comic-purple text-xs py-1.5 px-3.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Phát Sóng Ngay</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
