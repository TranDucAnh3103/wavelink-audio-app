import React from 'react';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { Check, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

let lastToastMessage = '';
let lastToastTime = 0;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
    const now = Date.now();
    if (message === lastToastMessage && now - lastToastTime < 1500) {
      return;
    }
    lastToastMessage = message;
    lastToastTime = now;

    if (dismissTimer) {
      clearTimeout(dismissTimer);
    }

    const id = Math.random().toString(36).substring(2, 9);
    set({ toasts: [{ id, message, type }] });

    const duration = type === 'error' ? 2800 : 2200;
    dismissTimer = setTimeout(() => {
      set({ toasts: [] });
    }, duration);
  },
  removeToast: (id) => {
    if (dismissTimer) clearTimeout(dismissTimer);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clearAll: () => {
    if (dismissTimer) clearTimeout(dismissTimer);
    set({ toasts: [] });
  },
}));

export const toast = {
  success: (msg: string) => useToastStore.getState().addToast(msg, 'success'),
  error: (msg: string) => useToastStore.getState().addToast(msg, 'error'),
  info: (msg: string) => useToastStore.getState().addToast(msg, 'info'),
  dismiss: () => useToastStore.getState().clearAll(),
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (typeof document === 'undefined' || toasts.length === 0) return null;

  const node = (
    <div
      className="fixed top-[72px] inset-x-0 md:left-auto md:right-6 z-[99999] flex flex-col items-center md:items-end pointer-events-none px-3 md:px-0 gap-2 max-w-[440px] mx-auto md:mx-0 transition-all"
      aria-live="polite"
    >
      {toasts.map((t) => {
        let badgeColor = 'bg-[#2A9D8F] text-white';
        let Icon = Check;
        let bgStyle =
          'bg-[var(--surface-card)] text-[var(--ink-primary)] border-[var(--border-ink)]';

        if (t.type === 'error') {
          badgeColor = 'bg-[#E63946] text-white';
          Icon = AlertTriangle;
          bgStyle =
            'bg-[#FFF1F2] dark:bg-[#2F161A] text-[#111113] dark:text-[#FEE2E2] border-[#E63946]';
        } else if (t.type === 'info') {
          badgeColor = 'bg-[#3A86FF] text-white';
          Icon = Info;
          bgStyle =
            'bg-[#EFF6FF] dark:bg-[#17233B] text-[#111113] dark:text-[#DBEAFE] border-[#3A86FF]';
        }

        return (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            title="Chạm để ẩn nhanh"
            className={`pointer-events-auto cursor-pointer inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full border-2 shadow-comic-sm text-xs font-bold transition-all duration-150 hover:scale-[1.02] active:scale-95 max-w-[92vw] sm:max-w-[400px] ${bgStyle}`}
          >
            <span
              className={`w-5 h-5 rounded-full ${badgeColor} border border-[#111113] flex items-center justify-center shrink-0 font-black`}
            >
              <Icon className="w-3 h-3" strokeWidth={3} />
            </span>
            <span className="truncate max-w-[240px] sm:max-w-[300px] leading-tight select-none font-bold">
              {t.message}
            </span>
            <button
              type="button"
              className="opacity-60 hover:opacity-100 ml-0.5 p-0.5 shrink-0 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
              aria-label="Đóng"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          </div>
        );
      })}
    </div>
  );

  return createPortal(node, document.body);
};
