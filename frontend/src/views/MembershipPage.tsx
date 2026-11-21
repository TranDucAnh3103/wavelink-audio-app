'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  Crown,
  Lock,
  Gem,
  ArrowUpCircle,
  Loader2,
  QrCode,
  Infinity as InfinityIcon,
  Zap,
  Timer,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  useMembershipPackages,
  useMyMembership,
  useCreateMembershipOrder,
  useCancelMembershipOrder,
} from '@/hooks/useMembership';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { api } from '@/services/api';
import { MembershipOrder } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { formatVND } from '@/lib/utils';
import { MembershipSkeleton } from '@/components/common/Skeletons';

export const MembershipPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuthStore();
  const { data: packages = [], isLoading: pkgLoading } = useMembershipPackages();
  const { data: myMembership } = useMyMembership();

  const createOrderMutation = useCreateMembershipOrder();
  const cancelOrderMutation = useCancelMembershipOrder();

  const isVip = myMembership?.isVip || user?.role === 'VIP' || user?.role === 'ADMIN';

  const [selectedPkgId, setSelectedPkgId] = useState<string>('VIP_3M');
  const [activeOrder, setActiveOrder] = useState<MembershipOrder | null>(null);
  const [countdownSec, setCountdownSec] = useState<number>(15 * 60);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);

  const handlePaymentConfirmed = useCallback(
    async (paidOrder: MembershipOrder) => {
      if (paidOrder.token && typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_token', paidOrder.token);
      }
      if (paidOrder.user) {
        useAuthStore.getState().updateUser({
          role: paidOrder.user.role,
          membership: paidOrder.user.membership as 'FREE' | 'VIP' | undefined,
          vipExpiresAt: paidOrder.user.vipExpiresAt || undefined,
        });
      }
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['my-membership'] });
      queryClient.invalidateQueries({ queryKey: ['membership-packages'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['import-quota'] });
      queryClient.invalidateQueries({ queryKey: ['audios'] });
      queryClient.invalidateQueries({ queryKey: ['audio'] });
      setActiveOrder(null);
      toast.success('Thanh toán payOS thành công! Quyền lợi VIP đã được kích hoạt tự động.');
    },
    [queryClient, refreshUser]
  );

  // Kiểm tra trạng thái đơn hàng khi quay về từ trang thanh toán payOS
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const returnedOrderCode = searchParams.get('orderCode');
    if (!paymentStatus && !returnedOrderCode) return;

    const cleanParams = new URLSearchParams(searchParams);
    cleanParams.delete('payment');
    cleanParams.delete('orderCode');
    cleanParams.delete('code');
    cleanParams.delete('id');
    cleanParams.delete('cancel');
    cleanParams.delete('status');
    setSearchParams(cleanParams, { replace: true });

    if (paymentStatus === 'cancelled') {
      toast.info('Bạn đã hủy giao dịch thanh toán payOS.');
      if (returnedOrderCode) {
        cancelOrderMutation.mutate(returnedOrderCode);
      }
      return;
    }

    if (returnedOrderCode) {
      const { isLive } = useAuthStore.getState();
      api.membership
        .getOrder(returnedOrderCode, isLive)
        .then((order) => {
          if (order?.status === 'PAID') {
            handlePaymentConfirmed(order);
          } else if (order && order.status === 'PENDING') {
            setActiveOrder(order);
            toast.info('Đơn hàng đang chờ xác nhận thanh toán từ payOS.');
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (packages.length > 0) {
      const currentSelected = packages.find((p) => p.id === selectedPkgId);
      if (!currentSelected || currentSelected.isLocked) {
        const firstAvailable = packages.find((p) => !p.isLocked);
        if (firstAvailable) {
          setSelectedPkgId(firstAvailable.id);
        } else {
          setSelectedPkgId(packages[0].id);
        }
      }
    }
  }, [packages, selectedPkgId]);

  // Countdown timer synced to order expiresAt
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (activeOrder) {
      const calcRemaining = () => {
        if (!activeOrder.expiresAt) return 15 * 60;
        const diff = Math.floor((new Date(activeOrder.expiresAt).getTime() - Date.now()) / 1000);
        return Math.max(0, diff);
      };
      setCountdownSec(calcRemaining());
      interval = setInterval(() => {
        setCountdownSec((prev) => {
          if (prev <= 1) {
            if (interval) clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeOrder]);

  // Auto-poll PayOS payment confirmation every 3 seconds while modal is open
  useEffect(() => {
    if (!activeOrder || activeOrder.status !== 'PENDING') return;
    let cancelled = false;

    const pollOrder = async () => {
      try {
        const { isLive } = useAuthStore.getState();
        const latest = await api.membership.getOrder(activeOrder.orderCode, isLive);
        if (cancelled || !latest) return;

        if (latest.status === 'PAID') {
          await handlePaymentConfirmed(latest);
        } else if (latest.status === 'CANCELLED' || latest.status === 'EXPIRED') {
          setActiveOrder(null);
          toast.error(
            latest.status === 'EXPIRED'
              ? 'Mã QR thanh toán đã hết hạn. Vui lòng tạo đơn mới.'
              : 'Đơn hàng thanh toán đã bị hủy.'
          );
        }
      } catch {
        // Ignore transient network errors during polling
      }
    };

    const timer = setInterval(pollOrder, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeOrder, handlePaymentConfirmed]);

  const getExpiryText = () => {
    if (user?.role === 'ADMIN' && !myMembership?.vipExpiresAt) {
      return 'Tài khoản Quản trị viên (Toàn quyền VIP không giới hạn)';
    }
    if (!myMembership?.vipExpiresAt) return 'Chưa kích hoạt VIP';
    const d = new Date(myMembership.vipExpiresAt);
    const daysLeft =
      myMembership.daysRemaining !== undefined
        ? myMembership.daysRemaining
        : Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
    return `Hạn dùng đến: ${d.toLocaleDateString('vi-VN')} (${daysLeft} ngày còn lại)`;
  };

  const handleCreateOrder = async () => {
    if (!user || user.isGuest || user.role === 'GUEST') {
      toast.error('Vui lòng đăng nhập hoặc tạo tài khoản để đăng ký gói VIP!');
      navigate('/login');
      return;
    }
    try {
      toast.info('Đang khởi tạo mã QR thanh toán qua payOS...');
      const order = await createOrderMutation.mutateAsync(selectedPkgId);
      setActiveOrder(order);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khi tạo đơn hàng payOS');
    }
  };

  const handleManualCheckOrder = async () => {
    if (!activeOrder) return;
    setIsCheckingStatus(true);
    try {
      const { isLive } = useAuthStore.getState();
      const latest = await api.membership.getOrder(activeOrder.orderCode, isLive);
      if (latest?.status === 'PAID') {
        await handlePaymentConfirmed(latest);
      } else if (latest?.status === 'CANCELLED' || latest?.status === 'EXPIRED') {
        setActiveOrder(null);
        toast.error('Đơn hàng đã hết hạn hoặc bị hủy.');
      } else {
        toast.info('Chưa ghi nhận thanh toán từ ngân hàng. Hệ thống sẽ tự kiểm tra mỗi 3 giây.');
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Không thể kiểm tra trạng thái đơn hàng');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!activeOrder) return;
    try {
      await cancelOrderMutation.mutateAsync(activeOrder.orderCode);
      setActiveOrder(null);
      toast.info('Đã hủy đơn hàng thanh toán.');
    } catch {
      setActiveOrder(null);
    }
  };

  const handleCopy = (label: string, value: string) => {
    if (!value) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value);
      toast.success(`Đã sao chép ${label}`);
    }
  };

  const formatTimer = (sec: number) => {
    if (sec <= 0) return 'HẾT HẠN';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(m)}:${pad(s)}`;
  };

  const showSkeletonFallback = useDelayedFallback(pkgLoading && packages.length === 0, 180);

  if (showSkeletonFallback) {
    return <MembershipSkeleton />;
  }

  if (pkgLoading && packages.length === 0) {
    return <div className="w-full max-w-5xl mx-auto px-4 md:px-6 min-h-[60vh]" />;
  }

  const selectedPkg = packages.find((p) => p.id === selectedPkgId);
  const isSelectedLocked = Boolean(selectedPkg?.isLocked);
  const isUpgrade = Boolean(selectedPkg?.canUpgrade);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col pb-36 md:pb-28 gap-5 pt-2 fade-in-comic">
      {/* VIP Hero Card */}
      <div
        className={`card-comic p-5 md:p-6 ${
          isVip ? 'bg-[#2A9D8F]' : 'bg-[#8338EC]'
        } text-white flex flex-col gap-2 border-2 border-[#111113] shadow-comic-lg`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="badge-comic badge-comic-yellow text-[10px] font-black">
            <Crown className="w-3 h-3 text-[#111113]" strokeWidth={2.5} />
            <span>{isVip ? 'VIP ACTIVE' : 'VIP PASS'}</span>
          </span>
          <span className="text-xs font-bold text-white/90 font-mono">
            {isVip ? 'ĐẶC QUYỀN CAO CẤP' : 'THANH TOÁN TỰ ĐỘNG QUA PAYOS'}
          </span>
        </div>
        <h1 className="font-comic font-extrabold text-xl md:text-2xl uppercase tracking-tight text-white mt-1">
          {isVip ? 'Hội Viên VIP Đang Hoạt Động' : 'Gói Hội Viên VIP'}
        </h1>
        <p className="text-xs sm:text-sm font-semibold text-white/90 max-w-2xl leading-relaxed">
          {isVip
            ? getExpiryText()
            : 'Mở khóa toàn bộ kho truyện giới hạn, không giới hạn lượt import YouTube và đồng bộ tiến trình đám mây ưu tiên cao nhất!'}
        </p>
      </div>

      {/* Package Selection Cards (3 Columns on md+) */}
      <div className="card-comic p-4 md:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b-2 border-[var(--border-ink)] pb-2">
          <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
            Chọn Gói Hội Viên Phù Hợp
          </span>
          <span className="badge-comic badge-comic-yellow text-[9px] font-black">
            VIETQR • PAYOS 24/7
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {packages.map((pkg) => {
            const isSelected = pkg.id === selectedPkgId;
            const isHot = pkg.id === 'VIP_3M';
            const isLocked = Boolean(pkg.isLocked);
            const isCurrent = Boolean(pkg.isCurrent);
            const canUpgrade = Boolean(pkg.canUpgrade);

            return (
              <div
                key={pkg.id}
                onClick={() => {
                  if (isLocked) {
                    toast.error(
                      isCurrent
                        ? 'Bạn đang kích hoạt gói này. Hãy chọn gói cao hơn để nâng cấp và cộng dồn thời hạn!'
                        : 'Gói này đã được sử dụng và hiện đang bị khóa đối với tài khoản của bạn!'
                    );
                    return;
                  }
                  setSelectedPkgId(pkg.id);
                }}
                className={`card-comic-sm p-4 flex flex-col justify-between gap-3 border-2 transition-all ${
                  isLocked
                    ? 'bg-[var(--surface-muted)] opacity-65 cursor-not-allowed'
                    : isSelected
                      ? 'bg-[var(--surface-accent-soft)] !border-[#FFE600] ring-2 ring-[#FFE600]/40 shadow-comic cursor-pointer'
                      : 'bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)] cursor-pointer'
                }`}
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`w-10 h-10 rounded-xl border-2 border-[#111113] flex items-center justify-center shrink-0 shadow-comic-sm ${
                        isLocked
                          ? 'bg-[var(--surface-card)] text-[var(--ink-muted)]'
                          : isSelected
                            ? 'bg-[#FFE600] text-[#111113]'
                            : 'bg-[var(--surface-card)] text-[var(--ink-primary)] border-[var(--border-ink)]'
                      }`}
                    >
                      {isLocked ? (
                        <Lock className="w-5 h-5" strokeWidth={2.5} />
                      ) : (
                        <Gem className="w-5 h-5" strokeWidth={2.25} />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 justify-end">
                      {isLocked && isCurrent && (
                        <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1.5 font-black">
                          GÓI HIỆN TẠI
                        </span>
                      )}
                      {isLocked && !isCurrent && (
                        <span className="badge-comic badge-comic-red text-[8px] py-0 px-1.5 font-black">
                          ĐÃ KHÓA
                        </span>
                      )}
                      {canUpgrade && (
                        <span className="badge-comic badge-comic-teal text-[8px] py-0 px-1.5 font-black flex items-center gap-0.5">
                          <ArrowUpCircle className="w-2.5 h-2.5" /> NÂNG CẤP
                        </span>
                      )}
                      {isHot && !isLocked && (
                        <span className="badge-comic badge-comic-red text-[8px] py-0 px-1.5 font-black">
                          KHUYÊN DÙNG
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-extrabold text-sm text-[var(--ink-primary)]">
                      {pkg.name}
                    </h3>
                    <p className="text-[11px] font-semibold text-[var(--ink-secondary)] mt-0.5">
                      {pkg.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-end justify-between pt-2.5 border-t border-[var(--border-ink)]/25">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[var(--ink-muted)] font-mono">
                      Thời hạn: {pkg.durationDays} ngày
                    </span>
                    <span
                      className={`font-comic font-extrabold text-lg ${
                        isLocked ? 'text-[var(--ink-muted)] line-through' : 'text-[#E63946]'
                      }`}
                    >
                      {formatVND(pkg.priceVND || pkg.amount || 0)}
                    </span>
                  </div>
                  <span
                    className={`badge-comic ${
                      isLocked
                        ? 'badge-comic-white opacity-70'
                        : isSelected
                          ? 'badge-comic-teal'
                          : 'badge-comic-white'
                    } text-[9px] py-0.5 px-2 font-bold`}
                  >
                    {isLocked
                      ? 'ĐÃ KHÓA'
                      : isSelected
                        ? 'ĐÃ CHỌN'
                        : canUpgrade
                          ? 'NÂNG CẤP'
                          : 'CHỌN GÓI'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleCreateOrder}
          disabled={createOrderMutation.isPending || isSelectedLocked}
          className={`btn-comic ${
            isSelectedLocked
              ? 'bg-[var(--surface-muted)] text-[var(--ink-muted)] cursor-not-allowed'
              : 'btn-comic-yellow'
          } text-xs sm:text-sm py-3 px-5 font-black shadow-comic-md w-full md:w-auto md:self-center md:min-w-[340px]`}
        >
          {createOrderMutation.isPending ? (
            <span className="flex items-center gap-2 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang khởi tạo mã QR payOS...</span>
            </span>
          ) : isSelectedLocked ? (
            <span className="flex items-center gap-2 justify-center">
              <Lock className="w-4 h-4" />
              <span>GÓI NÀY ĐÃ ĐĂNG KÝ (ĐÃ KHÓA)</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 justify-center">
              <QrCode className="w-4 h-4" strokeWidth={2.5} />
              <span>
                {isUpgrade
                  ? 'NÂNG CẤP GÓI & TẠO MÃ QR PAYOS'
                  : 'TẠO MÃ QR THANH TOÁN (PAYOS)'}
              </span>
            </span>
          )}
        </button>
      </div>

      {/* Benefits 3-Pillars Card */}
      <div className="card-comic p-4 md:p-5 flex flex-col gap-3.5">
        <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)] border-b-2 border-[var(--border-ink)] pb-2">
          Quyền Lợi Độc Quyền Hội Viên VIP
        </span>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="card-comic-sm p-3.5 bg-[var(--surface-elevated)] flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center text-[#111113] shrink-0 shadow-comic-sm">
              <InfinityIcon className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xs text-[var(--ink-primary)]">
                Không Giới Hạn Nhập YouTube
              </span>
              <span className="text-[11px] font-medium text-[var(--ink-secondary)] mt-0.5 leading-snug">
                Thành viên thường bị giới hạn 5 video/ngày. VIP được cày truyện tẹt ga.
              </span>
            </div>
          </div>

          <div className="card-comic-sm p-3.5 bg-[var(--surface-elevated)] flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-[#3A86FF] flex items-center justify-center text-white shrink-0 shadow-comic-sm">
              <Gem className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xs text-[var(--ink-primary)]">
                Truy Cập Toàn Bộ Truyện VIP Only
              </span>
              <span className="text-[11px] font-medium text-[var(--ink-secondary)] mt-0.5 leading-snug">
                Nghe trọn vẹn các bộ truyện đỉnh cao được gắn nhãn độc quyền VIP.
              </span>
            </div>
          </div>

          <div className="card-comic-sm p-3.5 bg-[var(--surface-elevated)] flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl border-2 border-[#111113] bg-[#2A9D8F] flex items-center justify-center text-white shrink-0 shadow-comic-sm">
              <Zap className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xs text-[var(--ink-primary)]">
                Đồng Bộ Tiến Trình Siêu Tốc
              </span>
              <span className="text-[11px] font-medium text-[var(--ink-secondary)] mt-0.5 leading-snug">
                Bảo toàn từng giây nghe trên đám mây, resume chuẩn xác trên mọi thiết bị.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* PayOS QR Payment Modal */}
      <Modal
        isOpen={Boolean(activeOrder)}
        onClose={() => setActiveOrder(null)}
        title="THANH TOÁN VIETQR • PAYOS"
        showFooter={false}
        size="md"
      >
        {activeOrder && (
          <div className="flex flex-col items-center text-center gap-3">
            <div className="relative p-3 bg-white rounded-xl border-2 border-[var(--border-ink)] shadow-comic-sm flex items-center justify-center overflow-hidden shrink-0">
              {activeOrder.qrCode ? (
                <QRCodeSVG
                  value={activeOrder.qrCode}
                  size={184}
                  level="M"
                  includeMargin={false}
                />
              ) : (
                <img
                  src={activeOrder.qrCodeUrl}
                  alt="Mã QR thanh toán payOS"
                  className="w-44 h-44 object-contain"
                />
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="badge-comic badge-comic-red text-[10px] font-mono font-black py-0.5 px-2.5">
                <Timer className="w-3 h-3" strokeWidth={2.5} />
                <span>Hết hạn: {formatTimer(countdownSec)}</span>
              </span>
              <span className="badge-comic badge-comic-teal text-[10px] font-black py-0.5 px-2.5">
                <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
                <span>Đang tự động kiểm tra...</span>
              </span>
            </div>

            <div className="card-comic-sm p-3 bg-[var(--surface-elevated)] w-full text-left flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between items-center py-0.5 border-b border-[var(--border-ink)]/20 gap-2">
                <span className="text-[var(--ink-secondary)] font-semibold">Ngân hàng:</span>
                <strong className="text-[var(--ink-primary)] font-bold text-right">
                  {activeOrder.bankName || 'VietQR / payOS'}
                </strong>
              </div>
              {activeOrder.accountNumber && (
                <div className="flex justify-between items-center py-0.5 border-b border-[var(--border-ink)]/20 gap-2">
                  <span className="text-[var(--ink-secondary)] font-semibold">Số tài khoản:</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('số tài khoản', activeOrder.accountNumber)}
                    className="inline-flex items-center gap-1 text-[var(--ink-primary)] font-mono font-bold hover:text-[#3A86FF] cursor-pointer"
                    title="Chạm để sao chép"
                  >
                    <span>{activeOrder.accountNumber}</span>
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              )}
              {activeOrder.accountName && (
                <div className="flex justify-between items-center py-0.5 border-b border-[var(--border-ink)]/20 gap-2">
                  <span className="text-[var(--ink-secondary)] font-semibold">Chủ TK:</span>
                  <strong className="text-[var(--ink-primary)] font-bold text-right">
                    {activeOrder.accountName}
                  </strong>
                </div>
              )}
              <div className="flex justify-between items-center py-0.5 border-b border-[var(--border-ink)]/20 gap-2">
                <span className="text-[var(--ink-secondary)] font-semibold">Số tiền:</span>
                <strong className="text-[#E63946] font-extrabold text-sm">
                  {formatVND(activeOrder.priceVND || activeOrder.amount || 0)}
                </strong>
              </div>
              <div className="flex justify-between items-center py-0.5 gap-2">
                <span className="text-[var(--ink-secondary)] font-semibold">Nội dung CK:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy('nội dung chuyển khoản', activeOrder.transferContent || activeOrder.orderCode)
                  }
                  className="inline-flex items-center gap-1 text-[#111113] font-mono font-bold text-xs bg-[#FFE600] px-1.5 py-0.5 rounded border border-[#111113] cursor-pointer"
                  title="Chạm để sao chép"
                >
                  <span>{activeOrder.transferContent || activeOrder.orderCode}</span>
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="card-comic-sm p-2.5 bg-[var(--surface-accent-soft)] text-[11px] font-semibold text-[var(--ink-primary)] text-left w-full leading-snug">
              Mở ứng dụng ngân hàng bất kỳ và quét mã QR payOS phía trên. Giữ đúng <strong>số tiền</strong> &amp; <strong>nội dung chuyển khoản</strong> để hệ thống tự kích hoạt VIP ngay sau khi giao dịch thành công!
            </div>

            {activeOrder.checkoutUrl && (
              <a
                href={activeOrder.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-comic btn-comic-primary text-xs py-2.5 font-black w-full justify-center"
              >
                <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
                <span>MỞ TRANG THANH TOÁN PAYOS</span>
              </a>
            )}

            <div className="flex items-center gap-2 w-full pt-0.5">
              <button
                type="button"
                onClick={handleManualCheckOrder}
                disabled={isCheckingStatus}
                className="btn-comic btn-comic-teal text-xs py-2 font-black flex-1"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`}
                  strokeWidth={2.5}
                />
                <span>{isCheckingStatus ? 'Đang kiểm tra...' : 'Kiểm Tra Giao Dịch'}</span>
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancelOrderMutation.isPending}
                className="btn-comic btn-comic-red text-xs py-2 font-black"
              >
                <X className="w-4 h-4" strokeWidth={3} />
                <span>Hủy Đơn</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
