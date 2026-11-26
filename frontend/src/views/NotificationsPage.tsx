'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Crown,
  Headphones,
  AlertTriangle,
  CheckCheck,
  Trash2,
  Settings,
  MailOpen,
  Ban,
  BellRing,
  ShieldCheck,
} from 'lucide-react';
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
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { NotificationsSkeleton } from '@/components/common/Skeletons';
import { Pagination } from '@/components/ui/Pagination';
import { NOTIFICATION_PAGE_SIZE } from '@/config/pagination';
import {
  externalNotificationService,
  normalizeNotificationPath,
} from '@/services/externalNotificationService';

const NOTIF_FILTERS = [
  { key: 'all', label: 'Tất cả', filter: 'all', type: 'ALL' },
  { key: 'unread', label: 'Chưa đọc', filter: 'unread', type: 'ALL' },
  { key: 'audio', label: 'Audio mới', filter: 'all', type: 'NEW_EPISODE' },
  { key: 'vip', label: 'VIP', filter: 'all', type: 'VIP' },
  { key: 'system', label: 'Hệ thống', filter: 'all', type: 'SYSTEM' },
] as const;

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeFilterKey, setActiveFilterKey] = useState<(typeof NOTIF_FILTERS)[number]['key']>('all');
  const activeFilter = NOTIF_FILTERS.find((f) => f.key === activeFilterKey) || NOTIF_FILTERS[0];

  const { data: notifications = [], isLoading } = useNotifications({
    filter: activeFilter.filter,
    type: activeFilter.type,
  });
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilterKey]);
  const pageSize = NOTIFICATION_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(notifications.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedNotifications = notifications.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  const markReadMutation = useMarkNotificationAsRead();
  const markAllReadMutation = useMarkAllNotificationsAsRead();
  const deleteMutation = useDeleteNotification();
  const deleteAllMutation = useDeleteAllNotifications();
  const { data: preferences } = useNotificationPreferences();
  const updatePrefsMutation = useUpdateNotificationPreferences();

  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);

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

    const sent = await externalNotificationService.showSystemNotification(
      'WaveLink • Thử Nghiệm Thông Báo',
      {
        body: 'Thông báo ngoài app đang hoạt động ổn định! Bạn sẽ nhận tin khi có tập truyện mới.',
        url: '/notifications',
        tag: `test-notif-${Date.now()}`,
      }
    );

    if (sent) {
      toast.success('Đã gửi thông báo ra màn hình hệ thống!');
    } else {
      toast.info('Thông báo đã được gửi (hoặc bị giới hạn tần suất chống spam).');
    }
  };

  const handleNotificationClick = async (id: number | string, link?: string) => {
    await markReadMutation.mutateAsync(id);
    if (link) {
      navigate(normalizeNotificationPath(link));
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'MEMBERSHIP':
      case 'VIP':
        return <Crown className="w-4 h-4 text-[#8338EC]" strokeWidth={2.5} />;
      case 'NEW_EPISODE':
      case 'AUDIO':
        return <Headphones className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />;
      case 'VIP_EXPIRED':
        return <AlertTriangle className="w-4 h-4 text-[#E63946]" strokeWidth={2.5} />;
      default:
        return <Bell className="w-4 h-4 text-[#D97706]" strokeWidth={2.5} />;
    }
  };

  const showSkeletonFallback = useDelayedFallback(isLoading && notifications.length === 0, 180);

  if (showSkeletonFallback) {
    return <NotificationsSkeleton />;
  }

  if (isLoading && notifications.length === 0) {
    return <div className="w-full max-w-4xl mx-auto px-4 md:px-6 min-h-[60vh]" />;
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      {/* Header Card */}
      <div className="card-comic p-4 md:p-5 bg-[#FFE600] text-[#111113] flex flex-col gap-1 border-2 border-[#111113]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-white flex items-center justify-center shadow-comic-sm shrink-0">
              <Bell className="w-5 h-5 text-[#111113]" strokeWidth={2.5} />
            </div>
            <h1 className="font-comic font-extrabold text-base md:text-lg uppercase text-[#111113] tracking-tight">
              Hộp Thư Thông Báo
            </h1>
          </div>
          <span className="badge-comic badge-comic-red text-[10px] font-black">
            {unreadCount} CHƯA ĐỌC
          </span>
        </div>
        <p className="text-xs font-bold text-[#111113]/80 mt-0.5">
          Cập nhật tin tức hội viên, tập truyện mới và hệ thống máy chủ ({pageSize} thông báo/trang)
        </p>
      </div>

      {/* Quick Actions Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="btn-comic text-xs py-1.5 px-3 disabled:opacity-40 disabled:pointer-events-none"
            title="Đánh dấu tất cả là đã đọc"
          >
            <CheckCheck className="w-4 h-4" strokeWidth={2.5} />
            <span>Đọc tất cả</span>
          </button>
          <button
            type="button"
            onClick={() => setIsDeleteAllModalOpen(true)}
            disabled={notifications.length === 0}
            className="btn-comic text-xs py-1.5 px-3 text-[#E63946] hover:bg-[#FFF1F2] dark:hover:bg-[#2F161A] disabled:opacity-40 disabled:pointer-events-none"
            title="Xóa toàn bộ thông báo"
          >
            <Trash2 className="w-4 h-4" strokeWidth={2.25} />
            <span>Xóa tất cả</span>
          </button>
        </div>

        <button
          type="button"
          onClick={openPrefsModal}
          className="btn-comic text-xs py-1.5 px-3"
          title="Tùy chỉnh nhận thông báo"
        >
          <Settings className="w-4 h-4" strokeWidth={2.25} />
          <span>Cài đặt nhận tin</span>
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {NOTIF_FILTERS.map((f) => {
          const isActive = activeFilterKey === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilterKey(f.key)}
              className={`btn-comic text-xs py-1.5 px-3 min-h-[36px] whitespace-nowrap shrink-0 ${
                isActive ? 'btn-comic-yellow' : ''
              }`}
            >
              <span>{f.label}</span>
              {f.key === 'unread' && unreadCount > 0 && (
                <span className="font-mono text-[11px] font-black text-[#E63946]">{unreadCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Notifications List */}
      <div className="flex flex-col gap-2.5">
        {notifications.length === 0 ? (
          <div className="card-comic p-8 text-center flex flex-col items-center gap-2.5">
            <MailOpen className="w-10 h-10 text-[var(--ink-muted)]" strokeWidth={1.75} />
            <h3 className="font-extrabold text-sm uppercase text-[var(--ink-primary)]">
              Chưa có thông báo nào
            </h3>
            <p className="text-xs font-medium text-[var(--ink-secondary)] max-w-sm">
              Các cập nhật quan trọng về đơn hàng VIP và tập truyện sẽ xuất hiện ở đây.
            </p>
          </div>
        ) : (
          <>
            {paginatedNotifications.map((n, idx) => (
              <div
                key={`notif-${n.id || idx}`}
                onClick={() => handleNotificationClick(n.id, n.link)}
                className={`card-comic-sm p-3.5 flex items-start gap-3 cursor-pointer transition-all group relative ${
                  !n.isRead
                    ? 'bg-[var(--surface-accent-soft)] shadow-comic'
                    : 'bg-[var(--surface-card)] opacity-85 hover:opacity-100'
                }`}
              >
                <div className="w-9 h-9 rounded-xl border border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center shrink-0 shadow-comic-sm">
                  {getNotificationIcon(n.type)}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-xs sm:text-sm text-[var(--ink-primary)] truncate leading-tight">
                      {n.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!n.isRead && (
                        <span className="badge-comic badge-comic-red text-[8px] py-0 px-1.5 font-black">
                          MỚI
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSingle(n.id);
                        }}
                        className="p-1 text-[var(--ink-muted)] hover:text-[#E63946] rounded transition-colors cursor-pointer"
                        title="Xóa thông báo này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-[var(--ink-secondary)] mt-1 leading-snug">
                    {n.message}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-[var(--ink-muted)] mt-1.5">
                    <span>{new Date(n.createdAt).toLocaleDateString('vi-VN')}</span>
                    {n.link && <span className="text-[#3A86FF] font-bold">Xem chi tiết →</span>}
                  </div>
                </div>
              </div>
            ))}

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

      {/* Delete All Modal */}
      <Modal
        isOpen={isDeleteAllModalOpen}
        onClose={() => setIsDeleteAllModalOpen(false)}
        title="XÓA TẤT CẢ THÔNG BÁO"
        confirmText="Xác nhận xóa sạch"
        isDanger
        onConfirm={handleDeleteAllConfirm}
        size="sm"
      >
        <div className="flex flex-col gap-2.5 text-xs">
          <div className="p-3 bg-[#FFF1F2] dark:bg-[#2F161A] border border-[#E63946] rounded-lg text-[#B91C1C] dark:text-[#FCA5A5] font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#E63946] shrink-0" />
            <span>
              Thao tác này sẽ xóa vĩnh viễn toàn bộ {notifications.length} thông báo hiện có!
            </span>
          </div>
          <p className="text-[var(--ink-secondary)]">
            Hộp thư thông báo của bạn sẽ được làm trống. Hệ thống sẽ không gửi lại các thông báo cũ đã xóa.
          </p>
        </div>
      </Modal>

      {/* Preferences Modal */}
      <Modal
        isOpen={isPrefsModalOpen}
        onClose={() => setIsPrefsModalOpen(false)}
        title="TÙY CHỌN NHẬN THÔNG BÁO"
        confirmText="Lưu Tùy Chọn"
        onConfirm={handleSavePreferences}
        size="md"
      >
        <div className="flex flex-col gap-2.5 text-xs">
          <div
            className={`p-3 rounded-xl border-2 ${
              prefBlockAll
                ? 'bg-[#FFF1F2] dark:bg-[#2F161A] border-[#E63946]'
                : 'bg-[var(--surface-elevated)] border-[var(--border-ink)]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <strong className="text-[var(--ink-primary)] font-extrabold flex items-center gap-1.5">
                  <Ban className="w-4 h-4 text-[#E63946]" />
                  <span>Chặn toàn bộ thông báo (Không làm phiền)</span>
                </strong>
                <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                  Tắt tất cả thông báo trong app và hệ thống ngoài app
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefBlockAll}
                onChange={(e) => setPrefBlockAll(e.target.checked)}
                className="w-4 h-4 rounded accent-[#E63946] cursor-pointer shrink-0"
              />
            </div>
            {prefBlockAll && (
              <p className="text-[10px] text-[#E63946] font-bold mt-1.5">
                Đang chặn: Bạn sẽ không nhận bất kỳ thông báo âm thanh hay biểu ngữ nào.
              </p>
            )}
          </div>

          <div
            className={`p-3 rounded-xl border-2 ${
              prefExternalAudio && !prefBlockAll
                ? 'bg-[#EFF6FF] dark:bg-[#17233B] border-[#3A86FF]'
                : 'bg-[var(--surface-elevated)] border-[var(--border-ink)] opacity-85'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <strong className="text-[var(--ink-primary)] font-extrabold flex items-center gap-1.5">
                  <BellRing className="w-4 h-4 text-[#3A86FF]" />
                  <span>Nhận thông báo audio mới ngoài app</span>
                </strong>
                <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                  Thông báo hệ thống khi có tập truyện mới ngay cả khi app đang đóng/ẩn
                </p>
              </div>
              <input
                type="checkbox"
                disabled={prefBlockAll}
                checked={prefExternalAudio && !prefBlockAll}
                onChange={(e) => handleToggleExternalAudio(e.target.checked)}
                className="w-4 h-4 rounded accent-[#3A86FF] cursor-pointer shrink-0"
              />
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-ink)]/20">
              <span className="text-[10px] text-[var(--ink-secondary)] font-semibold">
                Quyền hệ thống:{' '}
                {permissionStatus === 'granted' ? (
                  <span className="text-[#2A9D8F] font-bold">Đã cấp quyền</span>
                ) : permissionStatus === 'denied' ? (
                  <span className="text-[#E63946] font-bold">Đang bị chặn bởi trình duyệt</span>
                ) : (
                  <span className="text-[#D97706] font-bold">Chưa cấp quyền</span>
                )}
              </span>
              <button
                type="button"
                onClick={handleTestSystemNotification}
                disabled={prefBlockAll}
                className="text-[10px] font-bold text-[#3A86FF] hover:underline cursor-pointer"
              >
                Gửi thử thông báo
              </button>
            </div>
          </div>

          <p className="text-[var(--ink-primary)] font-bold pt-1">Các danh mục nội dung nhận tin:</p>

          <div className="flex items-center justify-between p-2.5 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-ink)]">
            <div>
              <strong className="text-[var(--ink-primary)] font-bold">Tập truyện & Audio mới</strong>
              <p className="text-[10px] text-[var(--ink-muted)]">
                Nhận tin khi truyện hoặc audio mới được thêm
              </p>
            </div>
            <input
              type="checkbox"
              disabled={prefBlockAll}
              checked={prefEpisodes && !prefBlockAll}
              onChange={(e) => setPrefEpisodes(e.target.checked)}
              className="w-4 h-4 rounded accent-[#3A86FF] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-ink)]">
            <div>
              <strong className="text-[var(--ink-primary)] font-bold">Hội viên & Đơn hàng VIP</strong>
              <p className="text-[10px] text-[var(--ink-muted)]">
                Gia hạn, xác nhận thanh toán và nâng cấp
              </p>
            </div>
            <input
              type="checkbox"
              disabled={prefBlockAll}
              checked={prefMembership && !prefBlockAll}
              onChange={(e) => setPrefMembership(e.target.checked)}
              className="w-4 h-4 rounded accent-[#8338EC] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-ink)]">
            <div>
              <strong className="text-[var(--ink-primary)] font-bold">
                Hệ thống máy chủ & Sự kiện
              </strong>
              <p className="text-[10px] text-[var(--ink-muted)]">
                Bảo trì hệ thống và thông báo quan trọng
              </p>
            </div>
            <input
              type="checkbox"
              disabled={prefBlockAll}
              checked={prefSystem && !prefBlockAll}
              onChange={(e) => setPrefSystem(e.target.checked)}
              className="w-4 h-4 rounded accent-[#FFE600] cursor-pointer"
            />
          </div>

          <div className="p-2.5 bg-[var(--surface-accent-soft)] border border-[var(--border-ink)]/30 rounded-xl text-[10px] text-[var(--ink-secondary)] font-semibold flex items-start gap-2 mt-1">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#D97706] mt-0.5" />
            <span>
              WaveLink áp dụng bộ lọc chống spam tự động: không gửi thông báo trùng lặp và giới hạn tần suất để không làm phiền bạn.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
