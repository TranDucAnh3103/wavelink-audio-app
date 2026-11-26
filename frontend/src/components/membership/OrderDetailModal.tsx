'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  QrCode,
  ReceiptText,
} from 'lucide-react';
import { MembershipOrder } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { formatVND } from '@/lib/utils';

export interface OrderDetailModalProps {
  order: MembershipOrder | null;
  onClose: () => void;
  onResumeQR?: (order: MembershipOrder) => void;
  onNavigateSupport?: () => void;
}

function formatDateTimeVN(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  onClose,
  onResumeQR,
  onNavigateSupport,
}) => {
  if (!order) return null;

  const isPaid = order.status === 'PAID';
  const isPending = order.status === 'PENDING';
  const amount = order.priceVND || order.amount || 0;
  const providerLabel =
    order.provider === 'VIETQR_DEV' ? 'VietQR (Mô phỏng phát triển)' : 'PayOS • Chuyển khoản QR';

  const handleCopy = (label: string, val?: string) => {
    if (!val) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(val);
      toast.success(`Đã sao chép ${label}`);
    }
  };

  return (
    <Modal
      isOpen={Boolean(order)}
      onClose={onClose}
      title="CHI TIẾT ĐƠN HÀNG VIP"
      showFooter={false}
      size="md"
    >
      <div className="flex flex-col gap-3.5 text-left" data-testid="order-detail-modal">
        {/* Status & Package Header */}
        <div className="card-comic-sm p-3.5 bg-[var(--surface-elevated)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border-2 border-[#111113] flex items-center justify-center shrink-0 shadow-comic-sm ${
                isPaid ? 'bg-[#2A9D8F] text-white' : 'bg-[#FFE600] text-[#111113]'
              }`}
            >
              <Crown className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-sm text-[var(--ink-primary)] truncate">
                {order.packageName || order.packageId}
              </span>
              <span className="text-[11px] font-bold text-[var(--ink-muted)] font-mono">
                Thời hạn: +{order.durationDays || 30} ngày VIP
              </span>
            </div>
          </div>

          <span
            className={`badge-comic ${
              isPaid ? 'badge-comic-teal' : 'badge-comic-yellow'
            } text-[10px] font-black py-1 px-2.5 inline-flex items-center gap-1`}
          >
            {isPaid ? (
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.5} />
            ) : (
              <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
            )}
            <span>{isPaid ? 'ĐÃ THANH TOÁN' : 'CHỜ THANH TOÁN'}</span>
          </span>
        </div>

        {/* Receipt Fields */}
        <div className="card-comic-sm p-3.5 bg-[var(--surface-card)] flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-1.5 pb-1.5 border-b-2 border-[var(--border-ink)]/25 font-black uppercase text-[11px] text-[var(--ink-primary)]">
            <ReceiptText className="w-3.5 h-3.5" />
            <span>Thông Tin Hóa Đơn</span>
          </div>

          <div className="flex justify-between items-center gap-2 py-1 border-b border-[var(--border-ink)]/15">
            <span className="text-[var(--ink-secondary)] font-semibold">Mã đơn hàng:</span>
            <button
              type="button"
              onClick={() => handleCopy('mã đơn hàng', order.orderCode)}
              className="inline-flex items-center gap-1 font-mono font-extrabold text-[var(--ink-primary)] hover:text-[#3A86FF] cursor-pointer"
              title="Sao chép mã đơn hàng"
            >
              <span>{order.orderCode}</span>
              <Copy className="w-3 h-3" />
            </button>
          </div>

          <div className="flex justify-between items-center gap-2 py-1 border-b border-[var(--border-ink)]/15">
            <span className="text-[var(--ink-secondary)] font-semibold">Số tiền thanh toán:</span>
            <strong className="font-comic font-extrabold text-base text-[#E63946]">
              {formatVND(amount)}
            </strong>
          </div>

          <div className="flex justify-between items-center gap-2 py-1 border-b border-[var(--border-ink)]/15">
            <span className="text-[var(--ink-secondary)] font-semibold">Cổng thanh toán:</span>
            <span className="inline-flex items-center gap-1 font-bold text-[var(--ink-primary)]">
              <CreditCard className="w-3.5 h-3.5" />
              <span>{providerLabel}</span>
            </span>
          </div>

          {order.bankName && (
            <div className="flex justify-between items-center gap-2 py-1 border-b border-[var(--border-ink)]/15">
              <span className="text-[var(--ink-secondary)] font-semibold">Ngân hàng nhận:</span>
              <strong className="font-bold text-[var(--ink-primary)] text-right">
                {order.bankName}
              </strong>
            </div>
          )}

          {order.accountNumber && (
            <div className="flex justify-between items-center gap-2 py-1 border-b border-[var(--border-ink)]/15">
              <span className="text-[var(--ink-secondary)] font-semibold">Số tài khoản:</span>
              <span className="font-mono font-bold text-[var(--ink-primary)]">
                {order.accountNumber}
                {order.accountName ? ` · ${order.accountName}` : ''}
              </span>
            </div>
          )}

          {order.transferContent && (
            <div className="flex justify-between items-center gap-2 py-1 border-b border-[var(--border-ink)]/15">
              <span className="text-[var(--ink-secondary)] font-semibold">Nội dung CK:</span>
              <button
                type="button"
                onClick={() => handleCopy('nội dung chuyển khoản', order.transferContent)}
                className="inline-flex items-center gap-1 font-mono font-bold bg-[#FFE600] text-[#111113] px-1.5 py-0.5 rounded border border-[#111113] cursor-pointer"
              >
                <span>{order.transferContent}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex justify-between items-center gap-2 py-1 border-b border-[var(--border-ink)]/15">
            <span className="text-[var(--ink-secondary)] font-semibold">Ngày tạo đơn:</span>
            <span className="font-bold text-[var(--ink-primary)]">
              {formatDateTimeVN(order.createdAt)}
            </span>
          </div>

          {isPaid ? (
            <div className="flex justify-between items-center gap-2 py-1">
              <span className="text-[var(--ink-secondary)] font-semibold">
                Thời điểm thanh toán:
              </span>
              <strong className="font-bold text-[#2A9D8F]">
                {formatDateTimeVN(order.paidAt || order.createdAt)}
              </strong>
            </div>
          ) : (
            <div className="flex justify-between items-center gap-2 py-1">
              <span className="text-[var(--ink-secondary)] font-semibold">Hạn thanh toán QR:</span>
              <strong className="font-bold text-[#E63946]">
                {formatDateTimeVN(order.expiresAt)}
              </strong>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
          {isPending && onResumeQR ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onResumeQR(order);
              }}
              className="btn-comic btn-comic-yellow text-xs py-2 px-3 font-black flex-1"
            >
              <QrCode className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>Mở Mã QR Thanh Toán</span>
            </button>
          ) : (
            onNavigateSupport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateSupport();
                }}
                className="btn-comic text-xs py-2 px-3 font-bold"
              >
                <span>Hỗ trợ / Hoàn tiền</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={onClose}
            className="btn-comic btn-comic-primary text-xs py-2 px-4 font-black ml-auto"
          >
            <span>Đóng</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
