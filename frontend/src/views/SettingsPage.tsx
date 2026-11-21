'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Palette,
  Sun,
  Moon,
  Monitor,
  Smile,
  LogIn,
  UserPlus,
  UserCog,
  Pencil,
  ImagePlus,
  KeyRound,
  CheckCircle2,
  Crown,
  XCircle,
  RotateCcw,
  Gauge,
  Bell,
  Ban,
  BellRing,
  Send,
  ShieldCheck,
  Headphones,
  MessageSquarePlus,
  RefreshCw,
  Trash2,
  LogOut,
  Chrome,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useMyMembership } from '@/hooks/useMembership';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { AdminTabs } from '@/pages/admin/AdminTabs';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { SettingsSkeleton } from '@/components/common/Skeletons';
import { api } from '@/services/api';
import { clearSwrCache } from '@/lib/swrCache';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useUnreadNotificationCount,
} from '@/hooks/useNotifications';
import { externalNotificationService } from '@/services/externalNotificationService';

const GOOGLE_CLIENT_ID = '1843465297-bbnnggqpe1s5r82gtvi2h0kli7fves7c.apps.googleusercontent.com';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLive, logout, refreshUser, isLoading, isInitialized } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { playbackRate, setPlaybackRate } = usePlayerStore();
  const { data: myMembership } = useMyMembership();

  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [nameInput, setNameInput] = useState(user?.username || '');

  const [isCoverOpen, setIsCoverOpen] = useState(false);
  const [coverInput, setCoverInput] = useState(user?.coverUrl || '');

  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isCancelVipOpen, setIsCancelVipOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [refundOrderCode, setRefundOrderCode] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundBank, setRefundBank] = useState('');

  const [isComplaintOpen, setIsComplaintOpen] = useState(false);
  const [complaintCategory, setComplaintCategory] = useState('Chung');
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintContent, setComplaintContent] = useState('');

  const [isClearCacheModalOpen, setIsClearCacheModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const isVip = myMembership?.isVip || user?.role === 'VIP' || user?.role === 'ADMIN';

  const { data: notifPrefs } = useNotificationPreferences();
  const updateNotifPrefsMutation = useUpdateNotificationPreferences();
  const { data: unreadNotifCount = 0 } = useUnreadNotificationCount();

  const [prefBlockAll, setPrefBlockAll] = useState(false);
  const [prefExternalAudio, setPrefExternalAudio] = useState(true);
  const [prefEpisodes, setPrefEpisodes] = useState(true);
  const [prefMembershipNotif, setPrefMembershipNotif] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (notifPrefs) {
      setPrefBlockAll(Boolean(notifPrefs.blockAll));
      setPrefExternalAudio(notifPrefs.externalAudio !== false);
      setPrefEpisodes(notifPrefs.notifyNewEpisodes !== false);
      setPrefMembershipNotif(notifPrefs.notifyMembership !== false);
    }
    setPermissionStatus(externalNotificationService.getPermission());
  }, [notifPrefs]);

  const handleToggleBlockAll = async (checked: boolean) => {
    setPrefBlockAll(checked);
    try {
      await updateNotifPrefsMutation.mutateAsync({
        blockAll: checked,
        externalAudio: prefExternalAudio,
        notifyNewEpisodes: prefEpisodes,
        notifyMembership: prefMembershipNotif,
        notifySystem: notifPrefs?.notifySystem !== false,
      });
      if (checked) {
        toast.info('Đã bật chế độ Chặn thông báo (Không làm phiền). Mọi thông báo sẽ tạm dừng.');
      } else {
        toast.success('Đã tắt chế độ chặn thông báo.');
      }
    } catch {
      toast.error('Lỗi khi lưu tùy chọn chặn thông báo');
    }
  };

  const handleToggleExternalAudio = async (checked: boolean) => {
    setPrefExternalAudio(checked);
    if (checked && externalNotificationService.isSupported()) {
      const granted = await externalNotificationService.requestPermission();
      setPermissionStatus(externalNotificationService.getPermission());
      if (granted) {
        toast.success('Đã cấp quyền nhận thông báo audio mới ngoài app!');
      } else {
        toast.info('Trình duyệt chưa cho phép thông báo. Vui lòng bật quyền trong trình duyệt.');
      }
    }
    try {
      await updateNotifPrefsMutation.mutateAsync({
        blockAll: prefBlockAll,
        externalAudio: checked,
        notifyNewEpisodes: prefEpisodes,
        notifyMembership: prefMembershipNotif,
        notifySystem: notifPrefs?.notifySystem !== false,
      });
    } catch {
      toast.error('Lỗi lưu tùy chọn nhận thông báo ngoài app');
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
        body: 'Thông báo audio mới ngoài app hoạt động tốt! Bạn sẽ nhận tin khi có tập mới.',
        url: '/notifications',
        tag: `test-settings-${Date.now()}`,
      }
    );
    if (sent) {
      toast.success('Đã gửi thông báo thử nghiệm ra ngoài app!');
    } else {
      toast.info('Thông báo đã được gửi (hoặc bị giới hạn tần suất chống spam).');
    }
  };

  const wallpaperPresets = [
    {
      name: 'Cyber City',
      url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Manga Studio',
      url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Neon Wave',
      url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800&auto=format&fit=crop&q=80',
    },
    {
      name: 'Galaxy Beats',
      url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
    },
  ];

  const handleGoogleLinkClick = () => {
    const google = (window as any).google;
    if (google?.accounts?.oauth2) {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        callback: async (resp: { access_token?: string; error?: string }) => {
          if (resp.access_token) {
            try {
              toast.info('Đang liên kết tài khoản Google...');
              const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${resp.access_token}` },
              });
              if (res.ok) {
                const info = await res.json();
                await api.user.linkGoogle(
                  {
                    googleId: info.sub,
                    avatarUrl: info.picture,
                    email: info.email,
                  },
                  isLive
                );
                await refreshUser();
                toast.success('Đã liên kết tài khoản Google thành công!');
              }
            } catch (err: unknown) {
              toast.error((err as Error).message || 'Lỗi khi liên kết Google');
            }
          } else if (resp.error) {
            toast.error('Liên kết Google bị hủy: ' + resp.error);
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    }
  };

  const handleUpdateName = async () => {
    if (!nameInput.trim()) {
      toast.error('Tên không được để trống');
      return false;
    }
    try {
      await api.user.updateProfile({ username: nameInput.trim() }, undefined, isLive);
      await refreshUser();
      toast.success('Đã cập nhật tên tài khoản thành công!');
      setIsEditNameOpen(false);
      return true;
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khi đổi tên');
      return false;
    }
  };

  const handleUpdateCover = async (urlToSave?: string) => {
    const finalUrl = (urlToSave !== undefined ? urlToSave : coverInput).trim();
    try {
      await api.user.updateProfile({ coverUrl: finalUrl }, undefined, isLive);
      await refreshUser();
      toast.success(finalUrl ? 'Đã cài đặt hình nền tài khoản!' : 'Đã xóa hình nền tài khoản!');
      setIsCoverOpen(false);
      return true;
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khi lưu hình nền');
      return false;
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast.error('Vui lòng nhập đầy đủ mật khẩu cũ và mới');
      return false;
    }
    if (newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự');
      return false;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Xác nhận mật khẩu mới không khớp');
      return false;
    }
    try {
      await api.user.updatePassword(oldPassword, newPassword, isLive);
      toast.success('Đổi mật khẩu thành công!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordOpen(false);
      return true;
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khi đổi mật khẩu');
      return false;
    }
  };

  const handleCancelVip = async () => {
    try {
      await api.membership.cancelVip(cancelReason, isLive);
      await refreshUser();
      toast.success('Đã hủy gói VIP thành công.');
      setIsCancelVipOpen(false);
      return true;
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khi hủy gói VIP');
      return false;
    }
  };

  const handleRequestRefund = async () => {
    if (!refundReason.trim()) {
      toast.error('Vui lòng nhập lý do hoàn tiền');
      return false;
    }
    try {
      await api.membership.requestRefund(
        refundOrderCode.trim(),
        refundReason.trim(),
        refundBank.trim(),
        isLive
      );
      toast.success('Yêu cầu hoàn tiền đã được gửi! Ban quản trị sẽ xử lý trong 24h.');
      setRefundReason('');
      setRefundBank('');
      setIsRefundOpen(false);
      return true;
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi gửi yêu cầu hoàn tiền');
      return false;
    }
  };

  const handleSubmitComplaint = async () => {
    if (!complaintSubject.trim() || !complaintContent.trim()) {
      toast.error('Vui lòng nhập tiêu đề và nội dung khiếu nại');
      return false;
    }
    try {
      await api.membership.submitComplaint(
        complaintSubject.trim(),
        complaintContent.trim(),
        complaintCategory,
        isLive
      );
      toast.success('Đã gửi khiếu nại thành công! WaveLink sẽ phản hồi qua thông báo.');
      setComplaintSubject('');
      setComplaintContent('');
      setIsComplaintOpen(false);
      return true;
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khi gửi khiếu nại');
      return false;
    }
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      toast.info('Đang quét và đồng bộ hàng đợi ngoại tuyến...');
      const count = await api.progress.syncOfflineQueue();
      toast.success(`Hàng đợi đã được đồng bộ hoàn toàn (${count} bản ghi)!`);
    } catch {
      toast.error('Lỗi khi đồng bộ hàng đợi ngoại tuyến');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearCache = () => {
    localStorage.removeItem('audio_library_db');
    clearSwrCache();
    toast.success('Đã dọn dẹp cache! Đang tải lại...');
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  const handleLogout = async () => {
    await logout();
    toast.info('Đã đăng xuất khỏi WaveLink');
    navigate('/login');
  };

  const isAuthBlocking =
    !user &&
    (isLoading ||
      (!isInitialized &&
        Boolean(typeof localStorage !== 'undefined' && localStorage.getItem('auth_token'))));
  const showSkeletonFallback = useDelayedFallback(isAuthBlocking, 180);

  if (showSkeletonFallback) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="flex flex-col w-full pb-36 md:pb-28 fade-in-comic">
      {user?.role === 'ADMIN' && <AdminTabs activeTab="settings" />}

      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col gap-5 pt-2">
        {/* Banner Card */}
        <div className="card-comic p-4 md:p-5 bg-[#FFE600] text-[#111113] flex items-center gap-3 border-2 border-[#111113]">
          <div className="w-10 h-10 rounded-xl border-2 border-[#111113] bg-white flex items-center justify-center shadow-comic-sm shrink-0">
            <Settings className="w-5 h-5 text-[#111113]" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-comic font-extrabold text-base md:text-lg uppercase tracking-tight text-[#111113]">
              Cài Đặt Hệ Thống & Tài Khoản
            </h1>
            <p className="text-xs font-bold text-[#111113]/80">
              Tùy biến giao diện Sáng/Tối/Hệ thống, bảo mật tài khoản, hình nền, gói VIP & hỗ trợ
            </p>
          </div>
        </div>

        {/* 2-Column Settings Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* 1. Theme Selection (Light / Dark / System) */}
          <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#8338EC]" strokeWidth={2.5} />
                <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                  Chế Độ Hiển Thị Giao Diện
                </span>
              </div>
              <span className="badge-comic badge-comic-yellow text-[9px] font-black uppercase">
                {theme === 'system' ? 'Auto System' : theme === 'dark' ? 'Dark Ink' : 'Light Paper'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`btn-comic text-xs py-2.5 flex-col sm:flex-row gap-1 ${
                  theme === 'light' ? 'btn-comic-yellow' : ''
                }`}
              >
                <Sun className="w-4 h-4" strokeWidth={2.25} />
                <span>Giấy Trắng</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`btn-comic text-xs py-2.5 flex-col sm:flex-row gap-1 ${
                  theme === 'dark' ? 'btn-comic-yellow' : ''
                }`}
              >
                <Moon className="w-4 h-4" strokeWidth={2.25} />
                <span>Dark Ink</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`btn-comic text-xs py-2.5 flex-col sm:flex-row gap-1 ${
                  theme === 'system' ? 'btn-comic-yellow' : ''
                }`}
              >
                <Monitor className="w-4 h-4" strokeWidth={2.25} />
                <span>Hệ Thống</span>
              </button>
            </div>
          </div>

          {/* 2. Default Playback Speed */}
          <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#2A9D8F]" strokeWidth={2.5} />
                <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                  Tốc Độ Phát Mặc Định
                </span>
              </div>
              <span className="badge-comic badge-comic-teal text-[9px] font-black">
                HIỆN TẠI: {playbackRate}x
              </span>
            </div>
            <p className="text-xs font-medium text-[var(--ink-secondary)]">
              Tốc độ này sẽ tự động lưu và áp dụng cho toàn bộ các tập audio khi bạn phát.
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setPlaybackRate(s, user?.id);
                    toast.success(`Đã lưu tốc độ phát mặc định: ${s}x`);
                  }}
                  className={`btn-comic text-xs py-2 font-black ${
                    Math.abs(playbackRate - s) < 0.05 ? 'btn-comic-yellow' : ''
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* 3. Account Profile & Wallpaper */}
          {user?.isGuest ? (
            <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Smile className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
                <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                  Tài Khoản Khách Vãng Lai
                </span>
              </div>
              <p className="text-xs font-medium text-[var(--ink-secondary)] leading-relaxed">
                Bạn đang duyệt ở chế độ khách nghe thử (chưa đăng nhập). Đăng nhập hoặc tạo tài khoản để lưu vĩnh viễn tiến trình nghe, tùy chỉnh tên hiển thị và bảo mật tài khoản.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="btn-comic btn-comic-primary text-xs py-2.5 font-black"
                >
                  <LogIn className="w-4 h-4" strokeWidth={2.5} />
                  <span>Đăng Nhập</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="btn-comic text-xs py-2.5 font-black"
                >
                  <UserPlus className="w-4 h-4" strokeWidth={2.5} />
                  <span>Đăng Ký</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <UserCog className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
                <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                  Hồ Sơ & Hình Nền Tài Khoản
                </span>
              </div>

              <div className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex items-center gap-3 relative overflow-hidden">
                {user?.coverUrl && (
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-30"
                    style={{ backgroundImage: `url(${user.coverUrl})` }}
                  />
                )}
                <div className="relative z-10 w-12 h-12 rounded-xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center font-black text-lg overflow-hidden shrink-0 shadow-comic-sm">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    (user?.username || 'U').substring(0, 2).toUpperCase()
                  )}
                </div>
                <div className="relative z-10 flex flex-col min-w-0 flex-1">
                  <span className="font-black text-sm text-[var(--ink-primary)] truncate">
                    {user?.username || 'Khách vãng lai'}
                  </span>
                  <span className="text-xs font-semibold text-[var(--ink-secondary)] truncate">
                    {user?.email || 'Chưa liên kết email'}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--ink-muted)]">
                    Hình nền: {user?.coverUrl ? 'Đã cài đặt hình nền riêng' : 'Mặc định'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(user?.username || '');
                    setIsEditNameOpen(true);
                  }}
                  className="btn-comic text-xs py-2 px-3"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Đổi Tên Hiển Thị</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCoverInput(user?.coverUrl || '');
                    setIsCoverOpen(true);
                  }}
                  className="btn-comic btn-comic-yellow text-xs py-2 px-3"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Đổi Hình Nền</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsPasswordOpen(true)}
                className="btn-comic text-xs py-2 px-3"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Đổi Mật Khẩu Đăng Nhập</span>
              </button>
            </div>
          )}

          {/* 4. Google Account Link */}
          {!user?.isGuest && (
            <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Chrome className="w-4 h-4 text-[#EA4335]" strokeWidth={2.5} />
                  <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                    Liên Kết Google Account
                  </span>
                </div>
                <span
                  className={`badge-comic ${
                    user?.googleId ? 'badge-comic-teal' : 'badge-comic-orange'
                  } text-[9px] font-black`}
                >
                  {user?.googleId ? 'ĐÃ LIÊN KẾT' : 'CHƯA LIÊN KẾT'}
                </span>
              </div>

              {user?.googleId ? (
                <div className="card-comic-sm p-3 bg-[#ECFDF5] dark:bg-[#132A23] border-[#2A9D8F] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border border-[#2A9D8F] bg-white flex items-center justify-center overflow-hidden shrink-0">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt="Google Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Chrome className="w-4 h-4 text-[#2A9D8F]" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-bold text-xs text-[#115E59] dark:text-[#99F6E4] truncate">
                      Tài khoản Google đã kết nối an toàn
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-[#0F766E] dark:text-[#5EEAD4] truncate">
                      ID: {user.googleId.substring(0, 14)}...
                    </span>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-[#2A9D8F] shrink-0" />
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs font-medium text-[var(--ink-secondary)]">
                    Liên kết tài khoản Google để đăng nhập 1 chạm và tự động đồng bộ ảnh đại diện từ Google.
                  </p>
                  <button
                    type="button"
                    onClick={handleGoogleLinkClick}
                    className="btn-comic text-xs py-2 px-4 font-extrabold self-start"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span>Liên Kết Với Google</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 5. VIP & Payment */}
          {!user?.isGuest && (
            <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-[#D97706]" strokeWidth={2.5} />
                  <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                    Hội Viên VIP & Thanh Toán
                  </span>
                </div>
                <span
                  className={`badge-comic ${
                    isVip ? 'badge-comic-purple' : 'badge-comic-white'
                  } text-[9px] font-black`}
                >
                  {isVip ? 'VIP ACTIVE' : 'FREE TIER'}
                </span>
              </div>

              <div className="card-comic-sm p-3 bg-[#F3E8FF] dark:bg-[#261B38] border-[#8338EC] flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="font-black text-xs text-[#3B0764] dark:text-[#E9D5FF]">
                    Trạng thái: {isVip ? 'Đang kích hoạt gói VIP' : 'Tài khoản thường'}
                  </span>
                  <span className="text-[11px] font-semibold text-[#581C87] dark:text-[#D8B4FE]">
                    {user?.vipExpiresAt
                      ? `Hạn dùng đến: ${new Date(user.vipExpiresAt).toLocaleDateString('vi-VN')}`
                      : 'Nâng cấp VIP để mở khóa truyện độc quyền & bỏ giới hạn'}
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate('/membership')}
                  className="text-xs py-1.5 px-3 shrink-0"
                >
                  {isVip ? 'Xem Gói' : 'Nâng Cấp'}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-ink)]/20">
                {isVip && (
                  <button
                    type="button"
                    onClick={() => setIsCancelVipOpen(true)}
                    className="btn-comic text-xs py-2 px-3 bg-[#FFF1F2] dark:bg-[#2F161A] text-[#E63946]"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Hủy Gói VIP</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRefundOrderCode(myMembership?.latestOrder?.orderCode || '');
                    setIsRefundOpen(true);
                  }}
                  className={`btn-comic text-xs py-2 px-3 ${!isVip ? 'col-span-2' : ''}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Yêu Cầu Hoàn Tiền</span>
                </button>
              </div>
            </div>
          )}

          {/* 6. Notification Preferences */}
          <div className="card-comic p-4 md:p-5 flex flex-col gap-3 lg:col-span-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
                <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                  Cài Đặt Thông Báo & Nhận Tin Ngoài App
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                className="badge-comic badge-comic-yellow text-[9px] font-black hover:scale-105 cursor-pointer"
                title="Mở Hộp thư thông báo"
              >
                HỘP THƯ ({unreadNotifCount} MỚI) →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                className={`p-3.5 rounded-xl border-2 ${
                  prefBlockAll
                    ? 'bg-[#FFF1F2] dark:bg-[#2F161A] border-[#E63946]'
                    : 'bg-[var(--surface-elevated)] border-[var(--border-ink)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <strong className="text-[var(--ink-primary)] text-xs font-black flex items-center gap-1.5">
                      <Ban className="w-4 h-4 text-[#E63946]" />
                      <span>Chặn toàn bộ thông báo (Không làm phiền)</span>
                    </strong>
                    <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                      Tắt tất cả thông báo trong app và hệ thống ngoài app để tập trung nghe truyện
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefBlockAll}
                    onChange={(e) => handleToggleBlockAll(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#E63946] cursor-pointer shrink-0"
                  />
                </div>
                {prefBlockAll && (
                  <div className="mt-2 text-[10px] text-[#E63946] font-bold bg-[var(--surface-card)] p-2 rounded-lg border border-[#E63946]/40">
                    Đang bật chế độ chặn: Mọi thông báo sẽ tạm dừng để không làm phiền bạn.
                  </div>
                )}
              </div>

              <div
                className={`p-3.5 rounded-xl border-2 ${
                  prefExternalAudio && !prefBlockAll
                    ? 'bg-[#EFF6FF] dark:bg-[#17233B] border-[#3A86FF]'
                    : 'bg-[var(--surface-elevated)] border-[var(--border-ink)] opacity-85'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <strong className="text-[var(--ink-primary)] text-xs font-black flex items-center gap-1.5">
                      <BellRing className="w-4 h-4 text-[#3A86FF]" />
                      <span>Nhận thông báo audio mới ngoài app</span>
                    </strong>
                    <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                      Gửi thông báo hệ điều hành khi có tập truyện mới ngay cả khi đang đóng hoặc ẩn ứng dụng
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

                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--border-ink)]/20 flex-wrap gap-2">
                  <span className="text-[10px] text-[var(--ink-secondary)] font-semibold">
                    Trạng thái quyền:{' '}
                    {permissionStatus === 'granted' ? (
                      <span className="text-[#2A9D8F] font-bold">Đã cấp quyền</span>
                    ) : permissionStatus === 'denied' ? (
                      <span className="text-[#E63946] font-bold">Đang bị chặn</span>
                    ) : (
                      <span className="text-[#D97706] font-bold">Chưa cấp quyền</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleTestSystemNotification}
                    disabled={prefBlockAll}
                    className="btn-comic text-[10px] py-1 px-2.5"
                  >
                    <Send className="w-3 h-3" />
                    <span>Thử gửi thông báo</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[var(--surface-accent-soft)] border border-[var(--border-ink)]/40 rounded-xl flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <div className="text-[11px] text-[var(--ink-secondary)] leading-snug">
                <strong className="font-extrabold text-[var(--ink-primary)]">
                  Chế độ lọc thông minh & Chống Spam:
                </strong>{' '}
                Hệ thống tự động giới hạn tần suất, không gửi lặp lại các thông báo cùng loại và chỉ tóm tắt các nội dung audio thực sự hữu ích.
              </div>
            </div>
          </div>

          {/* 7. Support & Complaints */}
          <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-[#F4A261]" strokeWidth={2.5} />
                <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                  Khiếu Nại & Hỗ Trợ Kỹ Thuật
                </span>
              </div>
              <span className="badge-comic badge-comic-white text-[9px]">24/7 SUPPORT</span>
            </div>
            <p className="text-xs font-medium text-[var(--ink-secondary)]">
              Gặp vấn đề về bản quyền, nạp VIP, âm thanh hoặc trải nghiệm? Gửi ngay phản hồi cho ban quản trị.
            </p>
            <button
              type="button"
              onClick={() => setIsComplaintOpen(true)}
              className="btn-comic btn-comic-yellow text-xs py-2 px-3"
            >
              <MessageSquarePlus className="w-4 h-4" strokeWidth={2.25} />
              <span>Gửi Khiếu Nại / Yêu Cầu Hỗ Trợ</span>
            </button>
          </div>

          {/* 8. Cache & Logout */}
          <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                Hệ Thống & Bộ Nhớ Tạm
              </span>
              <span className="badge-comic badge-comic-teal text-[9px]">ONLINE</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleForceSync}
                disabled={isSyncing}
                className="btn-comic text-xs py-2 px-3"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Đồng Bộ Ngay</span>
              </button>
              <button
                type="button"
                onClick={() => setIsClearCacheModalOpen(true)}
                className="btn-comic text-xs py-2 px-3"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa Cache</span>
              </button>
            </div>

            {!user?.isGuest && (
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(true)}
                className="btn-comic btn-comic-red text-xs py-2.5 px-3 mt-1"
              >
                <LogOut className="w-4 h-4" strokeWidth={2.5} />
                <span>Đăng Xuất Khỏi Thiết Bị</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODAL 1: Edit Display Name */}
      <Modal
        isOpen={isEditNameOpen}
        onClose={() => setIsEditNameOpen(false)}
        title="ĐỔI TÊN HIỂN THỊ"
        confirmText="Lưu Tên"
        cancelText="Hủy"
        onConfirm={handleUpdateName}
        size="sm"
      >
        <div className="flex flex-col gap-2.5 py-1">
          <label className="text-xs font-bold text-[var(--ink-primary)]">Tên hiển thị mới:</label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Nhập tên mới..."
            className="input-comic text-xs font-bold"
            maxLength={50}
          />
          <p className="text-[11px] font-medium text-[var(--ink-muted)]">
            Tên này sẽ hiển thị trên cộng đồng bình luận và trang cá nhân của bạn.
          </p>
        </div>
      </Modal>

      {/* MODAL 2: Cover Wallpaper */}
      <Modal
        isOpen={isCoverOpen}
        onClose={() => setIsCoverOpen(false)}
        title="HÌNH NỀN TÀI KHOẢN"
        confirmText="Áp Dụng"
        cancelText="Hủy"
        onConfirm={() => handleUpdateCover()}
        size="md"
      >
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Link ảnh hình nền (URL):
            </label>
            <input
              type="url"
              value={coverInput}
              onChange={(e) => setCoverInput(e.target.value)}
              placeholder="https://example.com/wallpaper.jpg"
              className="input-comic text-xs font-mono font-bold"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-[var(--ink-secondary)]">
              Hoặc chọn mẫu Manga/Anime có sẵn:
            </span>
            <div className="grid grid-cols-2 gap-2">
              {wallpaperPresets.map((preset) => (
                <div
                  key={preset.name}
                  onClick={() => setCoverInput(preset.url)}
                  className={`card-comic-sm p-1.5 flex flex-col gap-1 cursor-pointer ${
                    coverInput === preset.url
                      ? 'bg-[var(--surface-accent-soft)] !border-[#FFE600]'
                      : 'bg-[var(--surface-elevated)]'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.name}
                    className="w-full h-14 object-cover rounded"
                  />
                  <span className="text-[10px] font-black text-[var(--ink-primary)] truncate">
                    {preset.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {coverInput && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-[var(--ink-secondary)]">Xem trước:</span>
              <div
                className="w-full h-20 rounded-xl border-2 border-[var(--border-ink)] bg-cover bg-center shadow-comic-sm"
                style={{ backgroundImage: `url(${coverInput})` }}
              />
            </div>
          )}

          {user?.coverUrl && (
            <button
              type="button"
              onClick={() => handleUpdateCover('')}
              className="btn-comic text-[11px] py-1.5 bg-[#FFF1F2] dark:bg-[#2F161A] text-[#E63946]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa hình nền hiện tại</span>
            </button>
          )}
        </div>
      </Modal>

      {/* MODAL 3: Change Password */}
      <Modal
        isOpen={isPasswordOpen}
        onClose={() => setIsPasswordOpen(false)}
        title="ĐỔI MẬT KHẨU"
        confirmText="Xác Nhận"
        cancelText="Hủy"
        onConfirm={handleChangePassword}
        size="sm"
      >
        <div className="flex flex-col gap-2.5 py-1">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Mật khẩu hiện tại:
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••"
              className="input-comic text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Mật khẩu mới (tối thiểu 6 ký tự):
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="input-comic text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Xác nhận mật khẩu mới:
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="input-comic text-xs"
            />
          </div>
        </div>
      </Modal>

      {/* MODAL 4: Cancel VIP */}
      <Modal
        isOpen={isCancelVipOpen}
        onClose={() => setIsCancelVipOpen(false)}
        title="XÁC NHẬN HỦY GÓI VIP"
        isDanger
        confirmText="Hủy Gói VIP"
        cancelText="Giữ Gói VIP"
        onConfirm={handleCancelVip}
        size="sm"
      >
        <div className="flex flex-col gap-2.5 py-1">
          <p className="text-xs font-bold text-[#E63946]">
            Cảnh báo: Sau khi hủy, tài khoản của bạn sẽ mất các đặc quyền VIP (truyện VIP Only, không giới hạn YouTube).
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Lý do hủy (tùy chọn):
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Cho chúng tôi biết lý do bạn muốn dừng gói..."
              className="input-comic text-xs h-16 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* MODAL 5: Refund Request */}
      <Modal
        isOpen={isRefundOpen}
        onClose={() => setIsRefundOpen(false)}
        title="YÊU CẦU HOÀN TIỀN VIP"
        confirmText="Gửi Yêu Cầu"
        cancelText="Đóng"
        onConfirm={handleRequestRefund}
      >
        <div className="flex flex-col gap-2.5 py-1">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Mã đơn hàng VIP (nếu có):
            </label>
            <input
              type="text"
              value={refundOrderCode}
              onChange={(e) => setRefundOrderCode(e.target.value)}
              placeholder="Ví dụ: VIP_172893..."
              className="input-comic text-xs font-mono font-bold"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Lý do hoàn tiền (*):
            </label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Mô tả lý do bạn muốn hoàn tiền..."
              className="input-comic text-xs h-16 resize-none"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Thông tin ngân hàng nhận tiền:
            </label>
            <input
              type="text"
              value={refundBank}
              onChange={(e) => setRefundBank(e.target.value)}
              placeholder="Ngân hàng, STK, Tên chủ tài khoản..."
              className="input-comic text-xs font-bold"
            />
          </div>
          <p className="text-[11px] font-medium text-[var(--ink-muted)]">
            Chính sách: Hoàn tiền 100% trong vòng 7 ngày đầu nếu gặp lỗi kỹ thuật không khắc phục được.
          </p>
        </div>
      </Modal>

      {/* MODAL 6: Complaint & Support */}
      <Modal
        isOpen={isComplaintOpen}
        onClose={() => setIsComplaintOpen(false)}
        title="GỬI KHIẾU NẠI & GÓP Ý"
        confirmText="Gửi Đi"
        cancelText="Hủy"
        onConfirm={handleSubmitComplaint}
      >
        <div className="flex flex-col gap-2.5 py-1">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Chủ đề khiếu nại:
            </label>
            <select
              value={complaintCategory}
              onChange={(e) => setComplaintCategory(e.target.value)}
              className="input-comic text-xs font-bold"
            >
              <option value="Bản quyền truyện">Bản quyền nội dung / DMCA</option>
              <option value="Thanh toán & VIP">Sự cố nạp VIP / Đơn hàng</option>
              <option value="Chất lượng Audio">Lỗi âm thanh / Lỗi phát YouTube</option>
              <option value="Lỗi ứng dụng">Lỗi giao diện / Ứng dụng giật lag</option>
              <option value="Góp ý tính năng">Góp ý phát triển tính năng mới</option>
              <option value="Khác">Khác</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Tiêu đề ngắn gọn (*):
            </label>
            <input
              type="text"
              value={complaintSubject}
              onChange={(e) => setComplaintSubject(e.target.value)}
              placeholder="Tóm tắt vấn đề bạn gặp phải..."
              className="input-comic text-xs font-bold"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink-primary)]">
              Nội dung chi tiết (*):
            </label>
            <textarea
              value={complaintContent}
              onChange={(e) => setComplaintContent(e.target.value)}
              placeholder="Mô tả cụ thể thời điểm xảy ra lỗi, link truyện hoặc thông tin liên quan..."
              className="input-comic text-xs h-20 resize-none font-medium"
              required
            />
          </div>
        </div>
      </Modal>

      {/* MODAL 7: Clear Cache */}
      <Modal
        isOpen={isClearCacheModalOpen}
        onClose={() => setIsClearCacheModalOpen(false)}
        title="XÓA BỘ NHỚ TẠM?"
        isDanger
        confirmText="Xác Nhận"
        onConfirm={handleClearCache}
        size="sm"
      >
        <p className="text-xs font-semibold text-[var(--ink-secondary)]">
          Thao tác này sẽ xóa cache cục bộ và làm mới dữ liệu. Phiên đăng nhập sẽ được giữ nguyên.
        </p>
      </Modal>

      {/* MODAL 8: Logout */}
      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        title="ĐĂNG XUẤT TÀI KHOẢN?"
        isDanger
        confirmText="Đăng Xuất"
        cancelText="Ở Lại"
        onConfirm={handleLogout}
        size="sm"
      >
        <p className="text-xs font-semibold text-[var(--ink-secondary)]">
          Bạn có chắc chắn muốn đăng xuất khỏi WaveLink? Tiến trình nghe của bạn đã được bảo toàn trên đám mây.
        </p>
      </Modal>
    </div>
  );
};
