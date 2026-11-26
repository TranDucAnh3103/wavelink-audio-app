'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  UserX,
  ArrowLeft,
  ChevronLeft,
  Crown,
  Headphones,
  BookOpen,
  Disc3,
  Play,
  Smile,
  Sparkles,
  LogIn,
  UserPlus,
  Pencil,
  KeyRound,
  ChevronRight,
  LogOut,
  ReceiptText,
  QrCode,
  RefreshCw,
  Timer,
  CheckCircle2,
  Eye,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useRecentHistory } from '@/hooks/useHistory';
import { useAudios, useImportQuota } from '@/hooks/useAudio';
import { useMembershipOrders, useCancelMembershipOrder } from '@/hooks/useMembership';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { usePlayerStore } from '@/stores/playerStore';
import { OrderDetailModal } from '@/components/membership/OrderDetailModal';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingState } from '@/components/common/LoadingState';
import { ProfileSkeleton } from '@/components/common/Skeletons';
import { DEFAULT_PAGE_SIZE } from '@/config/pagination';
import { formatVND } from '@/lib/utils';
import { api } from '@/services/api';
import { MembershipOrder, UserProfileData } from '@/types';

export const ProfilePage: React.FC = () => {
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLive, logout, refreshUser, isLoading, isInitialized } = useAuthStore();
  const play = usePlayerStore((s) => s.play);

  const isViewingOther = Boolean(paramId && (!user?.id || String(user.id) !== String(paramId)));

  const { data: ordersData } = useMembershipOrders();
  const cancelOrderMutation = useCancelMembershipOrder();
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<MembershipOrder | null>(null);
  const [isCheckingOrder, setIsCheckingOrder] = useState(false);
  const [pendingRemainingSec, setPendingRemainingSec] = useState(0);
  const autoExpiredHandledRef = useRef<string | null>(null);

  const [publicUser, setPublicUser] = useState<UserProfileData | null>(null);
  const [loadingPublicUser, setLoadingPublicUser] = useState<boolean>(false);

  useEffect(() => {
    if (isViewingOther && paramId) {
      setLoadingPublicUser(true);
      api.user
        .getUserProfile(paramId)
        .then((data) => setPublicUser(data))
        .catch(() => setPublicUser(null))
        .finally(() => setLoadingPublicUser(false));
    }
  }, [paramId, isViewingOther]);

  const { data: otherAudios = [], isLoading: loadingOtherAudios } = useAudios(
    isViewingOther && paramId ? { userId: paramId } : { status: '__none__' }
  );

  const { data: history = [] } = useRecentHistory();
  const { data: myAudios = [] } = useAudios(
    !isViewingOther && user?.id ? { userId: user.id } : { status: 'my' }
  );
  const { data: importQuota } = useImportQuota();

  const pageSize = DEFAULT_PAGE_SIZE;
  const [historyPage, setHistoryPage] = useState(1);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const totalHistoryPages = Math.max(1, Math.ceil(history.length / pageSize));
  const safeHistoryPage = Math.min(Math.max(1, historyPage), totalHistoryPages);
  const paginatedHistory = history.slice(
    (safeHistoryPage - 1) * pageSize,
    safeHistoryPage * pageSize
  );
  const displayedHistory = showAllHistory ? history : paginatedHistory;

  const [myAudiosPage, setMyAudiosPage] = useState(1);
  const totalMyAudiosPages = Math.max(1, Math.ceil(myAudios.length / pageSize));
  const safeMyAudiosPage = Math.min(Math.max(1, myAudiosPage), totalMyAudiosPages);
  const paginatedMyAudios = myAudios.slice(
    (safeMyAudiosPage - 1) * pageSize,
    safeMyAudiosPage * pageSize
  );

  const [otherAudiosPage, setOtherAudiosPage] = useState(1);
  const totalOtherAudiosPages = Math.max(1, Math.ceil(otherAudios.length / pageSize));
  const safeOtherAudiosPage = Math.min(Math.max(1, otherAudiosPage), totalOtherAudiosPages);
  const paginatedOtherAudios = otherAudios.slice(
    (safeOtherAudiosPage - 1) * pageSize,
    safeOtherAudiosPage * pageSize
  );

  useEffect(() => {
    if (historyPage > totalHistoryPages) setHistoryPage(totalHistoryPages);
    if (myAudiosPage > totalMyAudiosPages) setMyAudiosPage(totalMyAudiosPages);
    if (otherAudiosPage > totalOtherAudiosPages) setOtherAudiosPage(totalOtherAudiosPages);
  }, [
    historyPage,
    totalHistoryPages,
    myAudiosPage,
    totalMyAudiosPages,
    otherAudiosPage,
    totalOtherAudiosPages,
  ]);

  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [newUsername, setNewUsername] = useState(user?.username || '');

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const activePendingOrder = ordersData?.activePendingOrder || null;
  const paidOrders = (ordersData?.orders || []).filter((o) => o.status === 'PAID');

  // Keep live countdown synced for active pending VIP order and auto-clean once when expired
  useEffect(() => {
    if (!activePendingOrder || activePendingOrder.status !== 'PENDING') {
      setPendingRemainingSec(0);
      return;
    }

    const calcRemaining = () => {
      if (!activePendingOrder.expiresAt) return activePendingOrder.remainingSeconds ?? 0;
      const diff = Math.floor((new Date(activePendingOrder.expiresAt).getTime() - Date.now()) / 1000);
      return Math.max(0, diff);
    };

    setPendingRemainingSec(calcRemaining());

    const timer = setInterval(() => {
      const next = calcRemaining();
      setPendingRemainingSec(next);
      if (next <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activePendingOrder]);

  useEffect(() => {
    if (!activePendingOrder || pendingRemainingSec > 0) return;
    if (autoExpiredHandledRef.current === activePendingOrder.orderCode) return;
    autoExpiredHandledRef.current = activePendingOrder.orderCode;

    api.membership
      .getOrder(activePendingOrder.orderCode, isLive)
      .then(async (res) => {
        if (res?.status === 'PAID') {
          await refreshUser();
          toast.success('Thanh toán thành công! Gói VIP đã được kích hoạt.');
        } else if (!res || res.deleted || res.status === 'EXPIRED' || res.status === 'CANCELLED') {
          toast.info('Đơn hàng quá hạn thanh toán QR nên đã được tự động hủy và xóa khỏi lịch sử.');
        }
      })
      .catch(() => {})
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: ['membership-orders'] });
        queryClient.invalidateQueries({ queryKey: ['my-membership'] });
        queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
      });
  }, [activePendingOrder, pendingRemainingSec, isLive, queryClient, refreshUser]);

  const handleCheckPendingOrder = async () => {
    if (!activePendingOrder) return;
    setIsCheckingOrder(true);
    try {
      const latest = await api.membership.getOrder(activePendingOrder.orderCode, isLive);
      if (latest?.status === 'PAID') {
        await refreshUser();
        queryClient.invalidateQueries({ queryKey: ['membership-orders'] });
        queryClient.invalidateQueries({ queryKey: ['my-membership'] });
        queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
        toast.success('Thanh toán thành công! Quyền lợi VIP đã được kích hoạt.');
      } else if (!latest || latest.deleted || latest.status === 'EXPIRED' || latest.status === 'CANCELLED') {
        queryClient.invalidateQueries({ queryKey: ['membership-orders'] });
        queryClient.invalidateQueries({ queryKey: ['my-membership'] });
        toast.info('Đơn hàng đã hết hạn hoặc bị hủy và đã được xóa khỏi lịch sử.');
      } else {
        toast.info('Đơn hàng đang chờ bạn hoàn tất quét mã QR thanh toán.');
      }
    } catch {
      toast.error('Không thể kiểm tra trạng thái đơn hàng lúc này.');
    } finally {
      setIsCheckingOrder(false);
    }
  };

  const handleCancelPendingOrder = async () => {
    if (!activePendingOrder) return;
    try {
      const res = await cancelOrderMutation.mutateAsync(activePendingOrder.orderCode);
      if (res.alreadyPaid) {
        toast.success(res.message || 'Đơn hàng đã thanh toán thành công, tài khoản VIP đã được kích hoạt!');
      } else {
        toast.info('Đã hủy và xóa đơn hàng chưa thanh toán khỏi lịch sử.');
      }
    } catch {
      toast.error('Không thể hủy đơn hàng lúc này.');
    }
  };

  const formatCountdown = (sec: number) => {
    if (sec <= 0) return 'HẾT HẠN';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatPaidDate = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isVipOrAdmin = user?.role === 'VIP' || user?.role === 'ADMIN';

  let vipCountdown = '';
  if (user?.role === 'VIP' && user?.vipExpiresAt) {
    const exp = new Date(user.vipExpiresAt);
    const diff = exp.getTime() - Date.now();
    if (diff > 0) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      vipCountdown = `(Còn ${days} ngày ${hours} giờ)`;
    } else {
      vipCountdown = '(Đã hết hạn)';
    }
  }

  const handleUpdateName = async () => {
    if (!newUsername.trim()) {
      toast.error('Tên không được để trống');
      return false;
    }
    try {
      await api.user.updateProfile(newUsername.trim(), user?.email, isLive);
      await refreshUser();
      toast.success('Đã đổi tên thành công!');
      return true;
    } catch {
      toast.error('Lỗi cập nhật tên');
      return false;
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast.error('Vui lòng nhập đầy đủ mật khẩu');
      return false;
    }
    try {
      await api.user.updatePassword(oldPassword, newPassword, isLive);
      toast.success('Đổi mật khẩu thành công!');
      return true;
    } catch {
      toast.error('Lỗi đổi mật khẩu');
      return false;
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.info('Đã đăng xuất');
    navigate('/login');
  };

  const handleResumeHistory = async (
    audioId: number,
    pos: number,
    episodeId?: number,
    episodeNumber?: number
  ) => {
    const targetAudio = await api.audio.getAudioById(audioId, isLive);
    if (targetAudio) {
      const targetEp =
        targetAudio.episodes?.find(
          (e) =>
            (episodeId && e.id === episodeId) || (episodeNumber && e.episodeNumber === episodeNumber)
        ) ||
        targetAudio.episodes?.find(
          (e) =>
            e.id === targetAudio.currentEpisodeId ||
            e.episodeNumber === targetAudio.currentEpisodeNumber
        ) ||
        targetAudio.episodes?.[0];
      play(targetAudio, targetEp, pos);
      navigate(`/player/${audioId}`);
    }
  };

  const isOtherLoading = isViewingOther && loadingPublicUser && !publicUser;
  const isOwnProfileLoading =
    !isViewingOther &&
    !user &&
    (isLoading ||
      (!isInitialized &&
        Boolean(typeof localStorage !== 'undefined' && localStorage.getItem('auth_token'))));
  const showSkeletonFallback = useDelayedFallback(isOtherLoading || isOwnProfileLoading, 180);

  if (showSkeletonFallback) {
    return <ProfileSkeleton />;
  }

  if (isOtherLoading || isOwnProfileLoading) {
    return <div className="w-full max-w-5xl mx-auto px-4 md:px-6 min-h-[60vh]" />;
  }

  // ========================================================
  // 1. PUBLIC PROFILE (/profile/:id)
  // ========================================================
  if (isViewingOther) {
    if (!publicUser) {
      return (
        <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center p-12 text-center gap-3 fade-in-comic">
          <div className="w-16 h-16 rounded-2xl border-2 border-[var(--border-ink)] bg-[var(--surface-muted)] flex items-center justify-center shadow-comic-sm">
            <UserX className="w-8 h-8 text-[var(--ink-muted)]" />
          </div>
          <h3 className="font-extrabold text-base text-[var(--ink-primary)] uppercase">
            Không tìm thấy người dùng
          </h3>
          <p className="text-xs text-[var(--ink-secondary)] font-semibold">
            Tài khoản này không tồn tại hoặc đã bị khóa.
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-comic btn-comic-primary text-xs py-2 px-4 mt-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay Lại</span>
          </button>
        </div>
      );
    }

    const isTargetVip = publicUser.role === 'VIP' || publicUser.membership === 'VIP';
    const isTargetAdmin = publicUser.role === 'ADMIN';

    return (
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-comic text-xs py-1.5 px-3 self-start"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
          <span>Quay lại</span>
        </button>

        {/* Public Profile Card */}
        <div className="card-comic p-4 md:p-5 flex flex-col gap-3.5 relative overflow-hidden">
          {publicUser.coverUrl && (
            <div
              className="absolute inset-x-0 top-0 h-24 bg-cover bg-center border-b-2 border-[var(--border-ink)]"
              style={{ backgroundImage: `url(${publicUser.coverUrl})` }}
            >
              <div className="absolute inset-0 bg-[var(--surface-card)]/60" />
              <div className="absolute inset-0 bg-gradient-to-b from-[var(--surface-card)]/85 via-[var(--surface-card)]/40 to-transparent" />
            </div>
          )}

          <div
            className={`flex items-center gap-3.5 relative z-10 ${
              publicUser.coverUrl ? 'pt-12' : ''
            }`}
          >
            <div
              className={`relative w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 border-[#111113] ${
                isTargetAdmin
                  ? 'bg-[#E63946] text-white'
                  : isTargetVip
                    ? 'bg-[#8338EC] text-white'
                    : 'bg-[#FFE600] text-[#111113]'
              } flex items-center justify-center font-black text-2xl shadow-comic-sm shrink-0 overflow-hidden`}
            >
              {publicUser.avatarUrl ? (
                <img
                  src={publicUser.avatarUrl}
                  alt={publicUser.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                (publicUser.username || 'U').substring(0, 2).toUpperCase()
              )}
              {(isTargetVip || isTargetAdmin) && (
                <span className="absolute -top-1 -right-1 text-[#FFE600] drop-shadow">
                  <Crown className="w-4 h-4 fill-[#FFE600]" />
                </span>
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-base md:text-lg text-[var(--ink-primary)] truncate leading-tight">
                  {publicUser.username}
                </h2>
                <span
                  className={`badge-comic ${
                    isTargetAdmin
                      ? 'badge-comic-red'
                      : isTargetVip
                        ? 'badge-comic-purple'
                        : 'badge-comic-yellow'
                  } text-[9px] font-black`}
                >
                  {publicUser.vipBadge}
                </span>
              </div>
              <span className="text-xs font-semibold text-[var(--ink-muted)] truncate mt-0.5">
                Mã độc giả: #{publicUser.id}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t-2 border-[var(--border-ink)]/30 mt-1">
            <div className="card-comic-sm p-3 bg-[var(--surface-accent-soft)] flex items-center gap-2.5">
              <Headphones className="w-5 h-5 text-[#3A86FF] shrink-0" strokeWidth={2.5} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[var(--ink-secondary)]">
                  Đã cày truyện
                </span>
                <span className="font-black text-xs sm:text-sm text-[var(--ink-primary)]">
                  {publicUser.totalHours} giờ
                </span>
              </div>
            </div>

            <div className="card-comic-sm p-3 bg-[#E0F2FE] dark:bg-[#17253B] flex items-center gap-2.5">
              <BookOpen className="w-5 h-5 text-[#0284C7] shrink-0" strokeWidth={2.5} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[var(--ink-secondary)]">
                  Kho truyện chia sẻ
                </span>
                <span className="font-black text-xs sm:text-sm text-[var(--ink-primary)]">
                  {publicUser.uploadCount} bộ
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Uploaded Audios by Target User */}
        <div className="card-comic p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)]">
            <div className="flex items-center gap-2">
              <Disc3 className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.5} />
              <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                Truyện Đã Chia Sẻ ({otherAudios.length})
              </span>
            </div>
            {otherAudios.length > 0 && (
              <button
                type="button"
                onClick={() => navigate(`/library?userId=${publicUser.id}`)}
                className="badge-comic badge-comic-blue text-[9px] py-0.5 px-2 font-bold hover:opacity-90 cursor-pointer"
              >
                Xem trong Thư Viện →
              </button>
            )}
          </div>

          {loadingOtherAudios ? (
            <LoadingState message="Đang tải danh sách truyện..." />
          ) : otherAudios.length === 0 ? (
            <span className="text-xs font-semibold text-[var(--ink-muted)] py-6 text-center">
              Độc giả này chưa đăng tải bộ truyện nào lên cộng đồng.
            </span>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {paginatedOtherAudios.map((audio) => (
                  <div
                    key={audio.id}
                    className="card-comic-sm p-2.5 bg-[var(--surface-elevated)] flex items-center justify-between gap-2.5 hover:bg-[var(--surface-muted)] transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={audio.thumbnailUrl || '/wavelink-icon.png'}
                        alt={audio.title}
                        loading="lazy"
                        decoding="async"
                        className="w-11 h-12 rounded-lg border border-[var(--border-ink)] object-cover shrink-0 bg-[#111113]"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate leading-tight">
                          {audio.title}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--ink-muted)] mt-0.5">
                          {audio.totalEpisodes || audio.episodes?.length || 1} Tập ·{' '}
                          {audio.formattedDuration || '24h 00m'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/player/${audio.id}`)}
                      className="btn-comic btn-comic-primary text-[11px] py-1.5 px-3 shrink-0"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Nghe</span>
                    </button>
                  </div>
                ))}
              </div>

              {totalOtherAudiosPages > 1 && (
                <Pagination
                  currentPage={safeOtherAudiosPage}
                  totalPages={totalOtherAudiosPages}
                  totalItems={otherAudios.length}
                  pageSize={pageSize}
                  onPageChange={(p) => setOtherAudiosPage(p)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========================================================
  // 2. GUEST PROFILE VIEW
  // ========================================================
  if (user?.isGuest) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
        <div className="card-comic p-4 md:p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-16 h-16 rounded-2xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center shadow-comic-sm shrink-0">
              <Smile className="w-8 h-8" strokeWidth={2.25} />
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-base md:text-lg text-[var(--ink-primary)] truncate leading-tight">
                  Khách Nghe Thử
                </h2>
                <span className="badge-comic badge-comic-yellow text-[9px] font-black">
                  CHƯA ĐĂNG NHẬP
                </span>
              </div>
              <span className="text-xs font-semibold text-[var(--ink-muted)] truncate mt-0.5">
                Chế độ khách vãng lai · Chưa có tài khoản
              </span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="badge-comic badge-comic-white text-[9px] py-0.5 px-1.5 font-bold">
                  Trạng thái: <strong>Khách vãng lai</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card-comic p-4 md:p-5 bg-[#FFE600] text-[#111113] flex flex-col gap-3 border-2 border-[#111113]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border-2 border-[#111113] bg-white flex items-center justify-center shadow-comic-sm shrink-0">
              <Sparkles className="w-5 h-5 text-[#E63946]" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-sm uppercase text-[#111113] leading-tight">
                Đăng Nhập / Tạo Tài Khoản
              </span>
              <span className="text-xs font-bold text-[#111113]/80 leading-tight mt-0.5">
                Đăng nhập để giữ lại toàn bộ lịch sử nghe và tiến trình khi đổi thiết bị!
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
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
              className="btn-comic text-xs py-2.5 font-black bg-white text-[#111113] hover:bg-gray-100 border-[#111113]"
            >
              <UserPlus className="w-4 h-4" strokeWidth={2.5} />
              <span>Đăng Ký Mới</span>
            </button>
          </div>
        </div>

        {history.length > 0 && (
          <div className="card-comic p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)] gap-2 flex-wrap">
              <span className="font-extrabold text-xs uppercase text-[var(--ink-primary)]">
                Tiến Trình Nghe Tạm Trong Phiên
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="badge-comic badge-comic-yellow text-[9px] font-black">
                  {history.length} BỘ TRUYỆN
                </span>
                {history.length > pageSize && (
                  <button
                    type="button"
                    data-testid="profile-toggle-all-history-btn"
                    onClick={() => setShowAllHistory((prev) => !prev)}
                    className="text-[11px] font-extrabold text-[#3A86FF] hover:underline cursor-pointer"
                  >
                    {showAllHistory ? 'Thu gọn' : `Xem tất cả (${history.length})`}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {displayedHistory.map((item) => {
                const progress = item.progressPercent || 0;
                const title = item.title || 'Truyện Audio';
                const epTitle = item.currentEpisodeTitle || 'Tập 1';
                const pos = item.formattedPosition || '00:00:00';

                return (
                  <div
                    key={`${item.audioId}-${item.episodeId}`}
                    className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex flex-col gap-2 hover:bg-[var(--surface-muted)] transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={item.thumbnailUrl || '/wavelink-icon.png'}
                          alt={title}
                          loading="lazy"
                          decoding="async"
                          className="w-12 h-14 rounded-lg border border-[var(--border-ink)] object-cover shrink-0 bg-[#FFE600]"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/wavelink-icon.png';
                          }}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate leading-tight">
                            {title}
                          </span>
                          <span className="text-[11px] font-semibold text-[var(--ink-secondary)] truncate mt-0.5">
                            {epTitle} · Mốc: <strong>{pos}</strong>
                          </span>
                          <span className="text-[10px] font-mono text-[var(--ink-muted)]">
                            Đã nghe:{' '}
                            {Math.max(
                              1,
                              Math.round((item.totalDurationListened || item.durationListened || 60) / 60)
                            )}{' '}
                            phút (Lưu tạm)
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleResumeHistory(
                            item.audioId,
                            item.lastPositionSeconds || 0,
                            item.currentEpisodeId,
                            item.currentEpisodeNumber
                          )
                        }
                        className="btn-comic btn-comic-primary text-[10px] py-1.5 px-3 shrink-0"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Nghe tiếp</span>
                      </button>
                    </div>
                    <div className="w-full bg-[var(--surface-muted)] h-1.5 rounded-full border border-[var(--border-ink)] overflow-hidden">
                      <div className="h-full bg-[#3A86FF]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {!showAllHistory && totalHistoryPages > 1 && (
              <Pagination
                currentPage={safeHistoryPage}
                totalPages={totalHistoryPages}
                totalItems={history.length}
                pageSize={pageSize}
                onPageChange={(p) => setHistoryPage(p)}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ========================================================
  // 3. AUTHENTICATED USER PROFILE VIEW
  // ========================================================
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-4 pt-2 fade-in-comic">
      {/* 1. Profile Hero Card */}
      <div className="card-comic p-4 md:p-5 flex flex-col gap-3.5 relative overflow-hidden">
        {user?.coverUrl && (
          <div
            className="absolute inset-x-0 top-0 h-24 bg-cover bg-center border-b-2 border-[var(--border-ink)]"
            style={{ backgroundImage: `url(${user.coverUrl})` }}
          >
            <div className="absolute inset-0 bg-[var(--surface-card)]/60" />
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--surface-card)]/85 via-[var(--surface-card)]/40 to-transparent" />
          </div>
        )}

        <div className={`flex items-center gap-3.5 relative z-10 ${user?.coverUrl ? 'pt-12' : ''}`}>
          <div
            className={`relative w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 border-[#111113] ${
              user?.role === 'ADMIN'
                ? 'bg-[#E63946] text-white'
                : user?.role === 'VIP'
                  ? 'bg-[#8338EC] text-white'
                  : 'bg-[#FFE600] text-[#111113]'
            } flex items-center justify-center font-black text-2xl shadow-comic-sm shrink-0 overflow-hidden`}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-full h-full object-cover"
              />
            ) : (
              (user?.username || 'K').substring(0, 2).toUpperCase()
            )}
            {isVipOrAdmin && (
              <span className="absolute -top-1 -right-1 text-[#FFE600] drop-shadow">
                <Crown className="w-4 h-4 fill-[#FFE600]" />
              </span>
            )}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-extrabold text-base md:text-lg text-[var(--ink-primary)] truncate leading-tight">
                {user?.username || 'Khách'}
              </h2>
              <span
                className={`badge-comic ${
                  user?.role === 'ADMIN'
                    ? 'badge-comic-red'
                    : user?.role === 'VIP'
                      ? 'badge-comic-purple'
                      : 'badge-comic-yellow'
                } text-[9px] font-black`}
              >
                {user?.role || 'GUEST'}
              </span>
            </div>
            <span className="text-xs font-semibold text-[var(--ink-muted)] truncate mt-0.5">
              {user?.email || (user?.isGuest ? 'Khách vãng lai' : 'Chưa có email')}
            </span>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span
                className={`badge-comic ${
                  user?.role === 'VIP' ? 'badge-comic-purple' : 'badge-comic-white'
                } text-[9px] py-0.5 px-2 font-bold flex items-center gap-1`}
              >
                {user?.role === 'VIP' && <Crown className="w-3 h-3 text-[#FFE600]" />}
                <span>
                  Hội viên:{' '}
                  <strong>
                    {user?.role === 'VIP' ? 'VIP' : user?.role === 'ADMIN' ? 'ADMIN' : 'FREE'}
                  </strong>{' '}
                  {vipCountdown}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Quota Progress Bar */}
        <div className="card-comic-sm p-3 bg-[var(--surface-accent-soft)] flex flex-col gap-1.5 mt-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--ink-primary)]">
            <span>Hạn mức Import YouTube hôm nay:</span>
            <span>
              {isVipOrAdmin
                ? 'Không giới hạn'
                : `Đã dùng ${importQuota?.todayImportCount ?? 0}/${importQuota?.maxImportsPerDay ?? 5}`}
            </span>
          </div>
          <div className="w-full bg-[var(--surface-card)] h-2 rounded-full border border-[var(--border-ink)] overflow-hidden">
            <div
              className="h-full bg-[#3A86FF] transition-all duration-300"
              style={{
                width: isVipOrAdmin
                  ? '100%'
                  : `${Math.min(
                      100,
                      ((importQuota?.todayImportCount ?? 0) / (importQuota?.maxImportsPerDay ?? 5)) * 100
                    )}%`,
              }}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t-2 border-[var(--border-ink)]/30">
          <button
            type="button"
            onClick={() => {
              setNewUsername(user?.username || '');
              setIsEditNameOpen(true);
            }}
            className="btn-comic text-xs py-2"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Sửa Tên</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOldPassword('');
              setNewPassword('');
              setIsChangePasswordOpen(true);
            }}
            className="btn-comic text-xs py-2"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Đổi Mật Khẩu</span>
          </button>
          <button
            type="button"
            onClick={() => setIsLogoutModalOpen(true)}
            className="btn-comic btn-comic-red text-xs py-2 col-span-2 sm:col-span-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng Xuất Tài Khoản</span>
          </button>
        </div>
      </div>

      {/* VIP Upgrade Banner */}
      {!isVipOrAdmin && (
        <div
          onClick={() => navigate('/membership')}
          className="card-comic p-4 bg-[#8338EC] text-white flex items-center justify-between cursor-pointer border-2 border-[#111113] card-comic-interactive"
        >
          <div className="flex items-center gap-3">
            <Crown className="w-6 h-6 text-[#FFE600] shrink-0" strokeWidth={2.5} />
            <div className="flex flex-col">
              <span className="font-extrabold text-xs sm:text-sm uppercase text-white">
                Nâng Cấp Gói VIP
              </span>
              <span className="text-[11px] font-semibold text-white/90">
                Mở khóa truyện độc quyền & Không giới hạn import
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 shrink-0" strokeWidth={2.5} />
        </div>
      )}

      {/* VIP Orders & Payment History Section */}
      <div className="card-comic p-4 flex flex-col gap-3" data-testid="profile-vip-orders-section">
        <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)] gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-[#8338EC]" strokeWidth={2.5} />
            <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
              Đơn Hàng &amp; Lịch Sử VIP
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge-comic badge-comic-teal text-[9px] font-black">
              {paidOrders.length} ĐÃ THANH TOÁN
            </span>
            <button
              type="button"
              onClick={() => navigate('/membership')}
              className="text-[11px] font-extrabold text-[#3A86FF] hover:underline cursor-pointer"
            >
              Xem các gói VIP →
            </button>
          </div>
        </div>

        {/* Active Unexpired Pending Order Card */}
        {activePendingOrder && (
          <div
            data-testid="profile-pending-vip-order"
            className="card-comic-sm p-3.5 bg-[#FFF8CC] text-[#111113] border-2 border-[#111113] flex flex-col gap-2.5"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="badge-comic badge-comic-yellow text-[9px] font-black">
                    ĐANG CHỜ THANH TOÁN
                  </span>
                  <span className="badge-comic badge-comic-red text-[9px] font-mono font-black inline-flex items-center gap-1">
                    <Timer className="w-3 h-3" strokeWidth={2.5} />
                    <span>{formatCountdown(pendingRemainingSec)}</span>
                  </span>
                </div>
                <span className="font-extrabold text-sm mt-1">
                  {activePendingOrder.packageName || activePendingOrder.packageId}
                  {activePendingOrder.durationDays ? ` (+${activePendingOrder.durationDays} ngày)` : ''}
                </span>
                <span className="text-[11px] font-mono font-semibold text-[#111113]/75">
                  Mã đơn: {activePendingOrder.orderCode}
                </span>
              </div>

              <div className="text-right shrink-0">
                <span className="font-comic font-extrabold text-lg text-[#E63946]">
                  {formatVND(activePendingOrder.priceVND || activePendingOrder.amount || 0)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[#111113]/20">
              <button
                type="button"
                onClick={() =>
                  navigate(`/membership?orderCode=${encodeURIComponent(activePendingOrder.orderCode)}`)
                }
                className="btn-comic btn-comic-yellow text-xs py-1.5 px-3 font-black"
              >
                <QrCode className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span>Tiếp Tục Thanh Toán QR</span>
              </button>
              <button
                type="button"
                onClick={handleCheckPendingOrder}
                disabled={isCheckingOrder}
                className="btn-comic btn-comic-teal text-xs py-1.5 px-3 font-bold"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isCheckingOrder ? 'animate-spin' : ''}`}
                  strokeWidth={2.5}
                />
                <span>{isCheckingOrder ? 'Đang kiểm tra...' : 'Kiểm Tra'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrderDetail(activePendingOrder)}
                className="btn-comic text-xs py-1.5 px-3 font-bold bg-white text-[#111113]"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem chi tiết</span>
              </button>
              <button
                type="button"
                onClick={handleCancelPendingOrder}
                disabled={cancelOrderMutation.isPending}
                className="btn-comic btn-comic-red text-xs py-1.5 px-3 font-bold ml-auto"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span>Hủy Đơn</span>
              </button>
            </div>
          </div>
        )}

        {/* Paid VIP Order History */}
        {paidOrders.length === 0 ? (
          !activePendingOrder && (
            <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
              <span className="text-xs font-semibold text-[var(--ink-muted)]">
                Bạn chưa có giao dịch nâng cấp VIP nào.
              </span>
              <button
                type="button"
                onClick={() => navigate('/membership')}
                className="btn-comic btn-comic-yellow text-xs py-1.5 px-3.5 font-black"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Đăng Ký VIP Ngay</span>
              </button>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2" data-testid="profile-paid-vip-history">
            {paidOrders.map((order) => (
              <div
                key={order.orderCode}
                className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-[#2A9D8F] text-white flex items-center justify-center shrink-0 shadow-comic-sm">
                    <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate">
                        {order.packageName || order.packageId}
                      </span>
                      <span className="badge-comic badge-comic-teal text-[8px] py-0 px-1.5 font-black">
                        ĐÃ THANH TOÁN
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--ink-secondary)] mt-0.5">
                      +{order.durationDays || 30} ngày ·{' '}
                      <strong className="text-[#E63946]">
                        {formatVND(order.priceVND || order.amount || 0)}
                      </strong>
                    </span>
                    <span className="text-[10px] font-mono text-[var(--ink-muted)]">
                      Mã: {order.orderCode} · {formatPaidDate(order.paidAt || order.createdAt)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedOrderDetail(order)}
                  data-testid={`view-order-detail-${order.orderCode}`}
                  className="btn-comic btn-comic-primary text-[11px] py-1.5 px-3 font-bold shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Xem chi tiết</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2-Column Activity Panels on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Listening History */}
        <div className="card-comic p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)] gap-2 flex-wrap">
            <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
              Nhật Ký Cày Truyện Của Bạn
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="badge-comic badge-comic-yellow text-[9px] font-black">
                {history.length} BỘ TRUYỆN
              </span>
              {history.length > pageSize && (
                <button
                  type="button"
                  data-testid="profile-toggle-all-history-btn"
                  onClick={() => setShowAllHistory((prev) => !prev)}
                  className="text-[11px] font-extrabold text-[#3A86FF] hover:underline cursor-pointer"
                >
                  {showAllHistory ? 'Thu gọn' : `Xem tất cả (${history.length})`}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {history.length === 0 ? (
              <span className="text-xs font-semibold text-[var(--ink-muted)] py-4 text-center">
                Chưa có nhật ký nghe nào
              </span>
            ) : (
              <>
                {displayedHistory.map((item) => {
                  const progress = item.progressPercent || 0;
                  const title = item.title || 'Truyện Audio';
                  const epTitle = item.currentEpisodeTitle || 'Tập 1';
                  const pos = item.formattedPosition || '00:00:00';

                  return (
                    <div
                      key={`${item.audioId}-${item.episodeId}`}
                      className="card-comic-sm p-3 bg-[var(--surface-elevated)] flex flex-col gap-2 hover:bg-[var(--surface-muted)] transition-all"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={item.thumbnailUrl || '/wavelink-icon.png'}
                            alt={title}
                            loading="lazy"
                            decoding="async"
                            className="w-11 h-12 rounded-lg border border-[var(--border-ink)] object-cover shrink-0 bg-[#FFE600]"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = '/wavelink-icon.png';
                            }}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate leading-tight">
                              {title}
                            </span>
                            <span className="text-[11px] font-semibold text-[var(--ink-secondary)] truncate mt-0.5">
                              {epTitle} · Mốc: <strong>{pos}</strong>
                            </span>
                            <span className="text-[10px] font-mono text-[var(--ink-muted)]">
                              Đã nghe:{' '}
                              {Math.max(
                                1,
                                Math.round(
                                  (item.totalDurationListened || item.durationListened || 60) / 60
                                )
                              )}{' '}
                              phút
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleResumeHistory(
                              item.audioId,
                              item.lastPositionSeconds || 0,
                              item.currentEpisodeId,
                              item.currentEpisodeNumber
                            )
                          }
                          className="btn-comic btn-comic-primary text-[10px] py-1.5 px-3 shrink-0"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Nghe tiếp</span>
                        </button>
                      </div>
                      <div className="w-full bg-[var(--surface-muted)] h-1.5 rounded-full border border-[var(--border-ink)] overflow-hidden">
                        <div className="h-full bg-[#3A86FF]" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}

                {!showAllHistory && (
                  <Pagination
                    currentPage={safeHistoryPage}
                    totalPages={totalHistoryPages}
                    totalItems={history.length}
                    pageSize={pageSize}
                    onPageChange={(p) => setHistoryPage(p)}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* My Uploaded Stories */}
        <div className="card-comic p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b-2 border-[var(--border-ink)] gap-2 flex-wrap">
            <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
              Truyện Do Bạn Nhập
            </span>
            <div className="flex items-center gap-2">
              <span className="badge-comic badge-comic-teal text-[9px] font-black">
                {myAudios.length} BỘ
              </span>
              {user?.id && (
                <button
                  type="button"
                  onClick={() => navigate(`/library?userId=${user.id}`)}
                  className="badge-comic badge-comic-blue text-[9px] py-0.5 px-2 font-bold hover:opacity-90 cursor-pointer"
                >
                  Xem trong Thư Viện →
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {myAudios.length === 0 ? (
              <span className="text-xs font-semibold text-[var(--ink-muted)] py-4 text-center">
                Bạn chưa nhập video YouTube nào
              </span>
            ) : (
              <>
                {paginatedMyAudios.map((audio) => (
                  <div
                    key={audio.id}
                    className="card-comic-sm p-2.5 bg-[var(--surface-elevated)] flex items-center justify-between gap-2.5 hover:bg-[var(--surface-muted)] transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={audio.thumbnailUrl || '/wavelink-icon.png'}
                        alt={audio.title}
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-12 rounded-lg border border-[var(--border-ink)] object-cover shrink-0 bg-[#111113]"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-extrabold text-xs text-[var(--ink-primary)] truncate leading-tight">
                          {audio.title}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--ink-muted)] mt-0.5">
                          {audio.totalEpisodes || audio.episodes?.length || 1} Tập ·{' '}
                          {audio.formattedDuration || '24h 00m'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/player/${audio.id}`)}
                      className="btn-comic text-[10px] py-1.5 px-3 shrink-0"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Xem</span>
                    </button>
                  </div>
                ))}

                <Pagination
                  currentPage={safeMyAudiosPage}
                  totalPages={totalMyAudiosPages}
                  totalItems={myAudios.length}
                  pageSize={pageSize}
                  onPageChange={(p) => setMyAudiosPage(p)}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Name Modal */}
      <Modal
        isOpen={isEditNameOpen}
        onClose={() => setIsEditNameOpen(false)}
        title="ĐỔI TÊN ĐỘC GIẢ"
        confirmText="Lưu Tên"
        onConfirm={handleUpdateName}
        size="sm"
      >
        <div className="flex flex-col gap-1.5">
          <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
            Tên người dùng mới
          </label>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="input-comic text-xs py-2"
          />
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        title="ĐỔI MẬT KHẨU"
        confirmText="Đổi Mật Khẩu"
        onConfirm={handleChangePassword}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">
            Mật khẩu hiện tại
          </label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="input-comic text-xs py-2"
            placeholder="••••••••"
          />
          <label className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)] mt-1">
            Mật khẩu mới
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-comic text-xs py-2"
            placeholder="••••••••"
          />
        </div>
      </Modal>

      {/* Logout Modal */}
      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        title="ĐĂNG XUẤT?"
        confirmText="Đăng Xuất"
        isDanger
        onConfirm={handleLogout}
        size="sm"
      >
        <p className="text-xs font-semibold text-[var(--ink-secondary)] leading-snug">
          Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng?
        </p>
      </Modal>

      {/* Order Receipt Detail Modal */}
      <OrderDetailModal
        order={selectedOrderDetail}
        onClose={() => setSelectedOrderDetail(null)}
        onResumeQR={(order) =>
          navigate(`/membership?orderCode=${encodeURIComponent(order.orderCode)}`)
        }
        onNavigateSupport={() => navigate('/settings')}
      />
    </div>
  );
};
