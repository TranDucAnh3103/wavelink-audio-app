'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useDeleteNotification,
  useDeleteAllNotifications,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotifications';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { LoadingState } from '@/components/common/LoadingState';
import { NotificationsSkeleton } from '@/components/common/Skeletons';
import { Pagination } from '@/components/ui/Pagination';
import { NOTIFICATION_PAGE_SIZE } from '@/config/pagination';
import { externalNotificationService } from '@/services/externalNotificationService';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: notifications = [], isLoading } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  // Phân trang 12 phần tử/trang từ biến môi trường VITE_ITEMS_PER_PAGE hoặc VITE_ITEMS_PER_PAGE
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = NOTIFICATION_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(notifications.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedNotifications = notifications.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  const markReadMutation = useMarkNotificationAsRead();
  const markAllReadMutation = useMarkAllNotificationsAsRead();
  const deleteMutation = useDeleteNotification();
  const deleteAllMutation = useDeleteAllNotifications();
  const { data: preferences } = useNotificationPreferences();
  const updatePrefsMutation = useUpdateNotificationPreferences();

  // Modals state
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);

  // Preference fields
  const [prefBlockAll, setPrefBlockAll] = useState(false);
  const [prefExternalAudio, setPrefExternalAudio] = useState(true);
  const [prefEpisodes, setPrefEpisodes] = useState(true);
  const [prefMembership, setPrefMembership] = useState(true);
  const [prefSystem, setPrefSystem] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  const openPrefsModal = () => {
    if (preferences) {
      setPrefBlockAll(Boolean(preferences.blockAll));
      setPrefExternalAudio(preferences.externalAudio !== false);
      setPrefEpisodes(preferences.notifyNewEpisodes !== false);
      setPrefMembership(preferences.notifyMembership !== false);
      setPrefSystem(preferences.notifySystem !== false);
    }
    setPermissionStatus(externalNotificationService.getPermission());
    setIsPrefsModalOpen(true);
  };

  const handleToggleExternalAudio = async (checked: boolean) => {
    setPrefExternalAudio(checked);
    if (checked && externalNotificationService.isSupported()) {
      const granted = await externalNotificationService.requestPermission();
      setPermissionStatus(externalNotificationService.getPermission());
      if (granted) {
        toast.success('Đã cấp quyền thông báo hệ thống ngoài app thành công!');
      } else {
        toast.info('Trình duyệt chưa cấp quyền thông báo. Vui lòng cho phép trong cài đặt trình duyệt.');
      }
    }
  };

  const handleSavePreferences = async () => {
    try {
      await updatePrefsMutation.mutateAsync({
        blockAll: prefBlockAll,
        externalAudio: prefExternalAudio,
        notifyNewEpisodes: prefEpisodes,
        notifyMembership: prefMembership,
        notifySystem: prefSystem,
      });
      toast.success('Đã lưu tùy chọn thông báo!');
      setIsPrefsModalOpen(false);
    } catch {
      toast.error('Lỗi cập nhật tùy chọn');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
      toast.success('Đã đánh dấu toàn bộ thông báo là đã đọc!');
    } catch {
      toast.error('Lỗi thao tác');
    }
  };

  const handleDeleteAllConfirm = async () => {
    try {
      await deleteAllMutation.mutateAsync();
      toast.success('Đã xóa toàn bộ thông báo khỏi hộp thư!');
      setIsDeleteAllModalOpen(false);
      setCurrentPage(1);
    } catch {
      toast.error('Lỗi khi xóa thông báo');
    }
  };

  const handleDeleteSingle = async (id: number | string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Đã xóa thông báo');
    } catch {
      toast.error('Lỗi khi xóa thông báo');
    }
  };

  const handleTestSystemNotification = async () => {
    if (prefBlockAll) {
      toast.error('Bạn đang bật chế độ chặn thông báo!');
      return;
    }
    const granted = await externalNotificationService.requestPermission();
    setPermissionStatus(externalNotificationService.getPermission());
    if (!granted) {
      toast.error('Trình duyệt chưa cấp quyền hiển thị thông báo ngoài màn hình');
      return;
    }

    const sent = await externalNotificationService.showSystemNotification('WaveLink • Thử Nghiệm Thông Báo 🎧', {
      body: 'Thông báo ngoài app đang hoạt động ổn định! Bạn sẽ nhận tin khi có tập truyện mới.',
      url: '/#/notifications',
      tag: `test-notif-${Date.now()}`,
    });

    if (sent) {
      toast.success('Đã gửi thông báo ra màn hình hệ thống!');
    } else {
      toast.info('Thông báo đã được gửi (hoặc bị giới hạn tần suất chống spam).');
    }
  };

  const handleNotificationClick = async (id: number | string, link?: string) => {
    await markReadMutation.mutateAsync(id);
    if (link) {
      if (link.startsWith('#/')) {
        navigate(link.substring(1));
      } else {
        navigate(link);
      }
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'MEMBERSHIP':
      case 'VIP':
        return <i className="ri-vip-crown-fill text-lg text-[#8338EC]" />;
      case 'NEW_EPISODE':
      case 'AUDIO':
        return <i className="ri-headphone-fill text-lg text-[#3A86FF]" />;
      case 'VIP_EXPIRED':
        return <i className="ri-alert-fill text-lg text-[#E63946]" />;
      default:
        return <i className="ri-notification-3-fill text-lg text-[#FFE600]" />;
    }
  };

  if (isLoading) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="flex flex-col w-full pb-36 px-4 gap-4 pt-2 fade-in-comic">
      {/* Notification Header Card */}
      <div className="card-comic p-4 bg-[#FFE600] flex flex-col gap-1 border-2 border-black">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black font-black shadow-comic-sm">
              <i className="ri-notification-3-line text-lg" />
            </div>
            <h1 className="font-extrabold text-base uppercase text-black tracking-tight">Hộp Thư Thông Báo</h1>
          </div>
          <span className="badge-comic badge-comic-red text-[9px] font-black">
            {unreadCount} CHƯA ĐỌC
          </span>
        </div>
        <p className="text-xs font-bold text-gray-800 mt-1">
          Cập nhật tin tức hội viên, tập truyện mới và hệ thống máy chủ ({pageSize} thông báo/trang)
        </p>
      </div>

      {/* Quick Actions Row */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="btn-comic text-xs py-1.5 px-3 bg-white flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
            title="Đánh dấu tất cả là đã đọc"
          >
            <i className="ri-check-double-line font-bold" /> Đọc tất cả
          </button>
          <button
            type="button"
            onClick={() => setIsDeleteAllModalOpen(true)}
            disabled={notifications.length === 0}
            className="btn-comic text-xs py-1.5 px-3 bg-white hover:bg-red-50 text-red-600 border-2 border-black flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
            title="Xóa toàn bộ thông báo"
          >
            <i className="ri-delete-bin-7-line font-bold" /> Xóa tất cả
          </button>
        </div>

        <button
          type="button"
          onClick={openPrefsModal}
          className="btn-comic text-xs py-1.5 px-3 bg-white flex items-center gap-1"
          title="Tùy chỉnh nhận thông báo"
        >
          <i className="ri-settings-3-line font-bold" /> Cài đặt nhận tin
        </button>
      </div>

      {/* Notifications List Container */}
      <div className="flex flex-col gap-2.5">
        {notifications.length === 0 ? (
          <div className="card-comic p-6 text-center flex flex-col items-center gap-2 bg-white">
            <i className="ri-mail-open-line text-3xl text-gray-400" />
            <h3 className="font-extrabold text-sm uppercase text-black">Chưa có thông báo nào</h3>
            <p className="text-xs font-semibold text-gray-500">
              Các cập nhật quan trọng về đơn hàng VIP và tập truyện sẽ xuất hiện ở đây.
            </p>
          </div>
        ) : (
          <>
            {paginatedNotifications.map((n, idx) => (
              <div
                key={`notif-${n.id || idx}`}
                onClick={() => handleNotificationClick(n.id, n.link)}
                className={`card-comic-sm p-3 flex items-start gap-3 border-2 border-black cursor-pointer transition-all group relative ${
                  !n.isRead ? 'bg-[#FEF9C3] shadow-comic' : 'bg-white opacity-85'
                }`}
              >
                <div className="w-9 h-9 rounded-lg border border-black bg-white flex items-center justify-center shrink-0 shadow-comic-sm">
                  {getNotificationIcon(n.type)}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-extrabold text-xs text-black truncate leading-tight">{n.title}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {!n.isRead && (
                        <span className="badge-comic badge-comic-red text-[8px] py-0 px-1 font-black">MỚI</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSingle(n.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                        title="Xóa thông báo này"
                      >
                        <i className="ri-delete-bin-line text-xs" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-700 mt-1 leading-snug">{n.message}</p>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1.5">
                    <span>{new Date(n.createdAt).toLocaleDateString('vi-VN')}</span>
                    {n.link && <span className="text-[#3A86FF] font-bold">Xem chi tiết →</span>}
                  </div>
                </div>
              </div>
            ))}

            {/* Ẩn phân trang nếu danh sách có <= 12 phần tử để giao diện tối giản và sạch sẽ hơn */}
            {notifications.length > 12 && (
              <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalItems={notifications.length}
                pageSize={pageSize}
                onPageChange={(p) => {
                  setCurrentPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Modal xác nhận xóa mọi thông báo */}
      <Modal
        isOpen={isDeleteAllModalOpen}
        onClose={() => setIsDeleteAllModalOpen(false)}
        title="XÓA TẤT CẢ THÔNG BÁO"
        confirmText="Xác nhận xóa sạch"
        onConfirm={handleDeleteAllConfirm}
      >
        <div className="flex flex-col gap-2.5 text-xs">
          <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-700 font-semibold flex items-center gap-2">
            <i className="ri-alert-fill text-base text-red-600 shrink-0" />
            <span>Thao tác này sẽ xóa vĩnh viễn toàn bộ {notifications.length} thông báo hiện có!</span>
          </div>
          <p className="text-gray-600">
            Hộp thư thông báo của bạn sẽ được làm trống. Hệ thống sẽ không gửi lại các thông báo cũ đã xóa.
          </p>
        </div>
      </Modal>

      {/* Notification Preferences Modal */}
      <Modal
        isOpen={isPrefsModalOpen}
        onClose={() => setIsPrefsModalOpen(false)}
        title="TÙY CHỌN NHẬN THÔNG BÁO"
        confirmText="Lưu Tùy Chọn"
        onConfirm={handleSavePreferences}
      >
        <div className="flex flex-col gap-2.5 text-[11px]">
          {/* Cài đặt Chặn thông báo */}
          <div className={`p-2 rounded border-2 ${prefBlockAll ? 'bg-red-50 border-red-500' : 'bg-gray-50 border-black'}`}>
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-black font-extrabold flex items-center gap-1">
                  <i className="ri-prohibited-line text-red-500 text-sm" /> Chặn toàn bộ thông báo (Không làm phiền)
                </strong>
                <p className="text-[10px] text-gray-500">Tắt tất cả thông báo trong app và hệ thống ngoài app</p>
              </div>
              <input
                type="checkbox"
                checked={prefBlockAll}
                onChange={(e) => setPrefBlockAll(e.target.checked)}
                className="w-4 h-4 border-2 border-black rounded accent-red-600 cursor-pointer"
              />
            </div>
            {prefBlockAll && (
              <p className="text-[10px] text-red-600 font-bold mt-1">
                ⚠️ Đang chặn: Bạn sẽ không nhận bất kỳ thông báo âm thanh hay biểu ngữ nào.
              </p>
            )}
          </div>

          {/* Cài đặt Nhận thông báo audio mới ngoài app */}
          <div className={`p-2 rounded border-2 ${prefExternalAudio && !prefBlockAll ? 'bg-blue-50 border-[#3A86FF]' : 'bg-gray-50 border-black opacity-85'}`}>
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-black font-extrabold flex items-center gap-1">
                  <i className="ri-notification-badge-line text-[#3A86FF] text-sm" /> Nhận thông báo audio mới ngoài app
                </strong>
                <p className="text-[10px] text-gray-500">
                  Thông báo hệ thống (Windows/Desktop) khi có tập truyện mới ngay cả khi app đang đóng/ẩn
                </p>
              </div>
              <input
                type="checkbox"
                disabled={prefBlockAll}
                checked={prefExternalAudio && !prefBlockAll}
                onChange={(e) => handleToggleExternalAudio(e.target.checked)}
                className="w-4 h-4 border-2 border-black rounded accent-[#3A86FF] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-200">
              <span className="text-[10px] text-gray-600 font-semibold">
                Quyền hệ thống: {permissionStatus === 'granted' ? (
                  <span className="text-green-600 font-bold">✓ Đã cấp quyền</span>
                ) : permissionStatus === 'denied' ? (
                  <span className="text-red-500 font-bold">✕ Đang bị chặn bởi trình duyệt</span>
                ) : (
                  <span className="text-yellow-600 font-bold">Chưa cấp quyền</span>
                )}
              </span>
              <button
                type="button"
                onClick={handleTestSystemNotification}
                disabled={prefBlockAll}
                className="text-[10px] font-bold text-[#3A86FF] hover:underline"
              >
                Gửi thử thông báo
              </button>
            </div>
          </div>

          <p className="text-gray-700 font-bold pt-1">Các danh mục nội dung nhận tin:</p>

          <div className="flex items-center justify-between p-1.5 bg-gray-50 rounded border border-black">
            <div>
              <strong className="text-black font-bold">Tập truyện & Audio mới</strong>
              <p className="text-[10px] text-gray-500">Nhận tin khi truyện hoặc audio mới được thêm</p>
            </div>
            <input
              type="checkbox"
              disabled={prefBlockAll}
              checked={prefEpisodes && !prefBlockAll}
              onChange={(e) => setPrefEpisodes(e.target.checked)}
              className="w-4 h-4 border-2 border-black rounded accent-[#3A86FF] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-1.5 bg-gray-50 rounded border border-black">
            <div>
              <strong className="text-black font-bold">Hội viên & Đơn hàng VIP</strong>
              <p className="text-[10px] text-gray-500">Gia hạn, xác nhận thanh toán và nâng cấp</p>
            </div>
            <input
              type="checkbox"
              disabled={prefBlockAll}
              checked={prefMembership && !prefBlockAll}
              onChange={(e) => setPrefMembership(e.target.checked)}
              className="w-4 h-4 border-2 border-black rounded accent-[#8338EC] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-1.5 bg-gray-50 rounded border border-black">
            <div>
              <strong className="text-black font-bold">Hệ thống máy chủ & Sự kiện</strong>
              <p className="text-[10px] text-gray-500">Bảo trì hệ thống và thông báo quan trọng</p>
            </div>
            <input
              type="checkbox"
              disabled={prefBlockAll}
              checked={prefSystem && !prefBlockAll}
              onChange={(e) => setPrefSystem(e.target.checked)}
              className="w-4 h-4 border-2 border-black rounded accent-[#FFE600] cursor-pointer"
            />
          </div>

          {/* Ghi chú chống spam */}
          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-800 font-semibold flex items-start gap-1.5 mt-1">
            <i className="ri-shield-check-line text-xs shrink-0 text-yellow-700 mt-0.5" />
            <span>WaveLink áp dụng bộ lọc chống spam tự động: không gửi thông báo trùng lặp và giới hạn tần suất để không làm phiền bạn.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

