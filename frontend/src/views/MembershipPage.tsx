'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Check,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  useMembershipPackages,
  useMyMembership,
  useCreateMembershipOrder,
  useSimulatePayment,
} from '@/hooks/useMembership';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { MembershipOrder } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { formatVND } from '@/lib/utils';
import { MembershipSkeleton } from '@/components/common/Skeletons';

export const MembershipPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: packages = [], isLoading: pkgLoading } = useMembershipPackages();
  const { data: myMembership } = useMyMembership();

  const createOrderMutation = useCreateMembershipOrder();
  const simulatePaymentMutation = useSimulatePayment();

  const isVip = myMembership?.isVip || user?.role === 'VIP' || user?.role === 'ADMIN';

  const [selectedPkgId, setSelectedPkgId] = useState<string>('VIP_3M');
  const [activeOrder, setActiveOrder] = useState<MembershipOrder | null>(null);
  const [countdownSec, setCountdownSec] = useState<number>(15 * 60);

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

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (activeOrder) {
      setCountdownSec(15 * 60);
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

  const getExpiryText = () => {
    if (!myMembership?.vipExpiresAt) return 'Chưa kích hoạt VIP';
    const d = new Date(myMembership.vipExpiresAt);
    return `Hạn dùng đến: ${d.toLocaleDateString('vi-VN')} (${myMembership.daysRemaining || 0} ngày còn lại)`;
  };

  const handleCreateOrder = async () => {
    if (user?.isGuest) {
      toast.error('Vui lòng đăng nhập hoặc tạo tài khoản để đăng ký gói VIP!');
      navigate('/login');
      return;
    }
    try {
      toast.info('Đang tạo đơn hàng và mã VietQR thanh toán...');
      const order = await createOrderMutation.mutateAsync(selectedPkgId);
      setActiveOrder(order);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi khi tạo đơn hàng');
    }
  };

  const handleSimulatePayment = async (status: 'SUCCESS' | 'FAILED') => {
    if (!activeOrder) return;
    try {
      toast.info('Đang mô phỏng giao dịch qua Webhook...');
      await simulatePaymentMutation.mutateAsync({
        orderCode: activeOrder.orderCode,
        status,
      });
      setActiveOrder(null);
      if (status === 'SUCCESS') {
        toast.success('Thanh toán thành công! Bạn đã được kích hoạt VIP!');
      } else {
        toast.error('Đơn hàng đã được đánh dấu thất bại');
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Lỗi mô phỏng thanh toán');
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
            {isVip ? 'ĐẶC QUYỀN CAO CẤP' : 'DÀNH CHO FAN CHÂN CHÍNH'}
          </span>
        </div>
        <h1 className="font-comic font-extrabold text-xl md:text-2xl uppercase tracking-tight text-white mt-1">
          {isVip ? 'Hội Viên VIP Đang Hoạt Động' : 'Gói Hội Viên VIP'}
        </h1>
        <p className="text-xs sm:text-sm font-semibold text-white/90 max-w-2xl leading-relaxed">
          {isVip
            ? getExpiryText()
            : 'Mở khóa toàn bộ kho truyện giới hạn, không giới hạn lượt import YouTube và tốc độ đồng bộ tiến trình ưu tiên cao nhất!'}
        </p>
      </div>

      {/* Package Selection Cards (3 Columns on md+) */}
      <div className="card-comic p-4 md:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b-2 border-[var(--border-ink)] pb-2">
          <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
            Chọn Gói Hội Viên Phù Hợp
          </span>
          <span className="badge-comic badge-comic-yellow text-[9px] font-black">
            ƯU ĐÃI NĂM 2026
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
                        ? canUpgrade
                          ? 'ĐÃ CHỌN'
                          : 'ĐÃ CHỌN'
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
              <span>Đang tạo đơn...</span>
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
                  ? 'NÂNG CẤP GÓI & TẠO MÃ QR (CỘNG DỒN THỜI HẠN)'
                  : 'TẠO MÃ QR THANH TOÁN (VIETQR)'}
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
                Nghe trọn vẹn các bộ truyện đỉnh cao được tác giả gắn nhãn độc quyền VIP.
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

      {/* VietQR Payment Modal */}
      <Modal
        isOpen={Boolean(activeOrder)}
        onClose={() => setActiveOrder(null)}
        title="MÃ THANH TOÁN VIETQR VIP"
        showFooter={false}
        size="md"
      >
        {activeOrder && (
          <div className="flex flex-col items-center text-center gap-3">
            <div className="relative p-2 bg-white rounded-xl border-2 border-[var(--border-ink)] shadow-comic-sm w-40 h-40 flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={activeOrder.qrCodeUrl}
                alt="VietQR"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="badge-comic badge-comic-red text-[10px] font-mono font-black py-0.5 px-2.5">
              <Timer className="w-3 h-3" strokeWidth={2.5} />
              <span>Hết hạn: {formatTimer(countdownSec)}</span>
            </div>

            <div className="card-comic-sm p-3 bg-[var(--surface-elevated)] w-full text-left flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between items-center py-0.5 border-b border-[var(--border-ink)]/20">
                <span className="text-[var(--ink-secondary)] font-semibold">Ngân hàng:</span>
                <strong className="text-[var(--ink-primary)] font-bold">
                  {activeOrder.bankName || 'MB Bank (Quân Đội)'}
                </strong>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[var(--border-ink)]/20">
                <span className="text-[var(--ink-secondary)] font-semibold">Số tài khoản:</span>
                <strong className="text-[var(--ink-primary)] font-mono font-bold">
                  {activeOrder.accountNumber || '0987654321'}
                </strong>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[var(--border-ink)]/20">
                <span className="text-[var(--ink-secondary)] font-semibold">Chủ TK:</span>
                <strong className="text-[var(--ink-primary)] font-bold">
                  {activeOrder.accountName || 'COMIC AUDIO HUB'}
                </strong>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[var(--border-ink)]/20">
                <span className="text-[var(--ink-secondary)] font-semibold">Số tiền:</span>
                <strong className="text-[#E63946] font-extrabold text-sm">
                  {formatVND(activeOrder.priceVND || activeOrder.amount || 0)}
                </strong>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[var(--ink-secondary)] font-semibold">Nội dung CK:</span>
                <strong className="text-[#111113] font-mono font-bold text-xs bg-[#FFE600] px-1.5 py-0.5 rounded border border-[#111113]">
                  {activeOrder.transferContent || activeOrder.orderCode}
                </strong>
              </div>
            </div>

            <div className="card-comic-sm p-2 bg-[var(--surface-accent-soft)] text-[11px] font-semibold text-[var(--ink-primary)] text-left w-full leading-snug">
              Quét tự động qua SePay/VietQR. Tài khoản sẽ nâng cấp tức thì khi chuyển khoản thành công!
            </div>

            <div className="flex items-center gap-2 w-full pt-0.5">
              <button
                type="button"
                onClick={() => handleSimulatePayment('SUCCESS')}
                className="btn-comic btn-comic-teal text-xs py-2 font-black flex-1"
              >
                <Check className="w-4 h-4" strokeWidth={3} />
                <span>Giả Lập Thành Công</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulatePayment('FAILED')}
                className="btn-comic btn-comic-red text-xs py-2 font-black flex-1"
              >
                <X className="w-4 h-4" strokeWidth={3} />
                <span>Giả Lập Thất Bại</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
