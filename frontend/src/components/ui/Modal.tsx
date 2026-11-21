import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onConfirm?: () => void | Promise<void | boolean>;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  showFooter?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  onConfirm,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  isDanger = false,
  showFooter = true,
  size = 'md',
  className,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleConfirm = async () => {
    if (onConfirm) {
      const res = await onConfirm();
      if (res !== false) onClose();
    } else {
      onClose();
    }
  };

  const sizeClass =
    size === 'sm'
      ? 'max-w-[380px]'
      : size === 'lg'
        ? 'max-w-[640px]'
        : 'max-w-[460px] md:max-w-[520px]';

  const modalNode = (
    <div
      className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain fade-in-comic"
      style={{ minHeight: '100dvh' }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'card-comic relative w-full max-h-[88dvh] flex flex-col p-4 sm:p-5 gap-3 bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-comic-lg my-auto',
          sizeClass,
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-[var(--border-ink)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFE600] border border-[#111113] inline-block shrink-0" />
            <h3 className="font-extrabold text-xs sm:text-sm uppercase tracking-tight text-[var(--ink-primary)] truncate">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] hover:bg-[var(--surface-muted)] active:translate-x-0.5 active:translate-y-0.5 shrink-0 ml-2 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="text-xs sm:text-sm font-medium text-[var(--ink-secondary)] flex flex-col gap-3 overflow-y-auto py-1 flex-1 min-h-0 pr-1">
          {children}
        </div>

        {/* Modal Footer */}
        {showFooter && (
          <div className="flex items-center justify-end gap-2 pt-2.5 border-t-2 border-[var(--border-ink)] shrink-0">
            <Button
              variant="default"
              size="sm"
              onClick={onClose}
              className="text-xs py-1.5 px-3 min-h-[36px]"
            >
              {cancelText}
            </Button>
            <Button
              variant={isDanger ? 'red' : 'primary'}
              size="sm"
              onClick={handleConfirm}
              className="text-xs py-1.5 px-3.5 min-h-[36px]"
            >
              {confirmText}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};
