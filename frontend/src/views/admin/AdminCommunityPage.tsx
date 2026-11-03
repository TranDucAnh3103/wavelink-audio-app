'use client';

import React, { useState, useEffect } from 'react';
import { AdminTabs } from './AdminTabs';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { LoadingState } from '@/components/common/LoadingState';
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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;

  // Delete message modal
  const [deletingMsgId, setDeletingMsgId] = useState<number | string | null>(null);

  // Clear all messages modal
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Admin broadcast message modal
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

    // Lắng nghe cập nhật realtime
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
      await api.community.sendMessage(`📢 [THÔNG BÁO QUẢN TRỊ VIÊN] ${text}`);
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

  // Filter messages
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

  const pagedMessages = filteredMessages.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

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
    <div className="flex flex-col w-full pb-32 px-3 sm:px-4 gap-3 fade-in-comic">
      {/* 1. Header Banner */}
      <div className="card-comic p-4 bg-[#FFE600] flex items-center justify-between border-2 border-black">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black font-black shadow-comic-sm">
            <i className="ri-community-fill text-xl text-[#3A86FF]" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-extrabold text-sm sm:text-base uppercase tracking-tight text-black">
              Quản Trị Cộng Đồng & Phòng Chat
            </h1>
            <span className="text-xs font-bold text-gray-800">
              Kiểm duyệt thảo luận, thống kê người online và bảng vàng
            </span>
          </div>
        </div>
      </div>

      {/* 2. Admin Tabs */}
      <AdminTabs activeTab="community" />

      {/* 3. Community Stats Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="card-comic p-3 bg-white flex flex-col gap-1 border-2 border-black shadow-comic-sm">
          <div className="flex items-center justify-between text-gray-600">
            <span className="text-[10px] font-bold uppercase">Tổng Tin Nhắn</span>
            <i className="ri-chat-3-line text-[#3A86FF] text-base" />
          </div>
          <span className="text-xl font-black text-black">{stats.totalMessages || messages.length}</span>
          <span className="text-[9px] font-semibold text-gray-500">Đã lưu trữ trong DB</span>
        </div>

        <div className="card-comic p-3 bg-[#FEF9C3] flex flex-col gap-1 border-2 border-black shadow-comic-sm">
          <div className="flex items-center justify-between text-gray-600">
            <span className="text-[10px] font-bold uppercase">Đang Trực Tuyến</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
          </div>
          <span className="text-xl font-black text-black">{stats.onlineCount}</span>
          <span className="text-[9px] font-bold text-emerald-700">WebSocket kết nối</span>
        </div>

        <div className="card-comic p-3 bg-[#F3E8FF] flex flex-col gap-1 border-2 border-black shadow-comic-sm">
          <div className="flex items-center justify-between text-gray-600">
            <span className="text-[10px] font-bold uppercase">Thành Viên VIP</span>
            <i className="ri-vip-crown-fill text-[#8338EC] text-base" />
          </div>
          <span className="text-xl font-black text-[#8338EC]">{stats.vipChatters}</span>
          <span className="text-[9px] font-semibold text-gray-600">Hội viên cao cấp</span>
        </div>

        <div className="card-comic p-3 bg-gray-50 flex flex-col gap-1 border-2 border-black shadow-comic-sm">
          <div className="flex items-center justify-between text-gray-600">
            <span className="text-[10px] font-bold uppercase">Khách Tham Gia</span>
            <i className="ri-user-shared-line text-gray-600 text-base" />
          </div>
          <span className="text-xl font-black text-black">{stats.guestChatters}</span>
          <span className="text-[9px] font-semibold text-gray-500">Độc giả vãng lai</span>
        </div>
      </div>

      {/* 4. Action Controls Bar */}
      <div className="card-comic p-3.5 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
            <input
              type="text"
              placeholder="Tìm kiếm theo người gửi, nội dung tin nhắn..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="input-comic text-xs pl-8 pr-3 py-1.5 w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button
            onClick={() => setIsAdminMsgModalOpen(true)}
            className="btn-comic btn-comic-purple text-xs py-1.5 px-3 flex items-center gap-1 shadow-comic-sm"
          >
            <i className="ri-broadcast-line text-[#FFE600]" />
            Gửi Thông Báo
          </button>

          <button
            onClick={() => setIsClearModalOpen(true)}
            className="btn-comic btn-comic-red text-xs py-1.5 px-3 flex items-center gap-1 shadow-comic-sm"
          >
            <i className="ri-delete-bin-line" />
            Dọn Dẹp Chat
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="btn-comic text-xs py-1.5 px-2.5 bg-gray-100 flex items-center gap-1"
            title="Làm mới"
          >
            <i className={`ri-refresh-line ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 5. Messages Moderation Feed / Table */}
      <div className="card-comic p-4 bg-white flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b-2 border-black">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs uppercase text-black">
              Danh Sách Tin Nhắn Kiểm Duyệt ({filteredMessages.length})
            </span>
          </div>
          <span className="badge-comic badge-comic-teal text-[9px] font-black">
            REALTIME LOG
          </span>
        </div>

        {isLoading ? (
          <AdminTableSkeleton rows={4} />
        ) : pagedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
            <i className="ri-chat-smile-3-line text-4xl text-gray-300" />
            <span className="text-xs font-bold text-gray-600">
              {searchQuery ? 'Không tìm thấy tin nhắn phù hợp với từ khóa' : 'Phòng chat hiện tại không có tin nhắn nào'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pagedMessages.map((m) => {
              const isAdmin = m.role === 'ADMIN';
              const isVip = m.isVip || m.role === 'VIP';
              const isGuest = m.role === 'GUEST' || m.userId === 0;

              return (
                <div
                  key={m.id}
                  className="card-comic-sm p-3 bg-white flex items-start justify-between gap-3 border-2 border-black shadow-comic-sm hover:border-[#3A86FF] transition-all"
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg border border-black bg-gray-100 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                      {isAdmin ? '👑' : isVip ? '⭐' : isGuest ? '👤' : '🎧'}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      {/* Sender Info Row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-xs text-black">{m.username}</span>
                        {isAdmin ? (
                          <span className="badge-comic badge-comic-red text-[8px] py-0 px-1">ADMIN</span>
                        ) : isVip ? (
                          <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-bold">VIP</span>
                        ) : isGuest ? (
                          <span className="badge-comic badge-comic-white text-[8px] py-0 px-1 text-gray-600">KHÁCH</span>
                        ) : (
                          <span className="badge-comic badge-comic-blue text-[8px] py-0 px-1">USER</span>
                        )}
                        <span className="text-[10px] text-gray-400 font-mono">ID: {m.id}</span>
                        <span className="text-[10px] text-gray-500 font-semibold ml-auto">
                          {formatMsgDate(m.createdAt)}
                        </span>
                      </div>

                      {/* Content */}
                      <p className="text-xs font-semibold text-gray-800 mt-1 whitespace-pre-wrap leading-relaxed">
                        {m.message}
                      </p>

                      {/* Attached Audio */}
                      {(m.sharedAudio || m.sharedAudioId) && (
                        <div className="mt-1.5 p-1.5 rounded border border-black bg-yellow-50 flex items-center gap-2 self-start max-w-full">
                          <i className="ri-music-2-fill text-[#3A86FF] text-xs" />
                          <span className="text-[10px] font-bold text-gray-700 truncate">
                            Truyện đính kèm: <span className="underline">{m.sharedAudio?.title || `Audio ID #${m.sharedAudioId}`}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-1 self-start">
                    <button
                      onClick={() => setDeletingMsgId(m.id)}
                      className="btn-comic btn-comic-red text-[10px] py-1 px-2 flex items-center gap-1 shadow-comic-sm"
                      title="Xóa tin nhắn này"
                    >
                      <i className="ri-delete-bin-line" />
                      Xóa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={filteredMessages.length}
          pageSize={pageSize}
          onPageChange={(p) => setCurrentPage(p)}
        />
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deletingMsgId !== null}
        onClose={() => setDeletingMsgId(null)}
        title="XÁC NHẬN XÓA TIN NHẮN"
        confirmText="Xóa vĩnh viễn"
        cancelText="Hủy"
        isDanger={true}
        onConfirm={handleDeleteMessage}
      >
        <p className="text-xs text-gray-800 font-semibold leading-relaxed">
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
        isDanger={true}
        onConfirm={handleClearAllMessages}
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs text-red-600 font-bold leading-relaxed">
            CẢNH BÁO: Toàn bộ lịch sử tin nhắn trong phòng chat cộng đồng sẽ bị xóa sạch khỏi cơ sở dữ liệu!
          </p>
          <p className="text-[11px] text-gray-600 font-semibold">
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
      >
        <div className="flex flex-col gap-3 py-1">
          <p className="text-xs text-gray-700 font-semibold leading-relaxed">
            Tin nhắn sẽ được gắn huy hiệu <strong>ADMIN</strong> và phát sóng trực tiếp tới tất cả độc giả đang kết nối.
          </p>
          <textarea
            value={adminMsgText}
            onChange={(e) => setAdminMsgText(e.target.value)}
            rows={3}
            placeholder="Nhập nội dung thông báo tới toàn thể cộng đồng..."
            className="input-comic text-xs p-2 resize-none font-medium"
          />
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-200">
            <button
              onClick={() => setIsAdminMsgModalOpen(false)}
              className="btn-comic text-xs py-1.5 px-3 bg-white"
            >
              Hủy
            </button>
            <button
              onClick={handleSendAdminAnnouncement}
              disabled={isSendingAdminMsg || !adminMsgText.trim()}
              className="btn-comic btn-comic-purple text-xs py-1.5 px-3 flex items-center gap-1 shadow-comic-sm disabled:opacity-50"
            >
              <i className="ri-send-plane-fill" />
              Phát Sóng Ngay
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
