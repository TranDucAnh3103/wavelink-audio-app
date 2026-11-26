'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminTabs, AdminTabsProps } from '@/views/admin/AdminTabs';

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export const AdminPage: React.FC<{
  active: AdminTabsProps['activeTab'];
  children: React.ReactNode;
}> = ({ active, children }) => (
  <div className="flex flex-col w-full pb-40 md:pb-28 fade-in-comic">
    <AdminTabs activeTab={active} />
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-4">{children}</div>
  </div>
);

export const PageTitle: React.FC<{ title: string; action?: React.ReactNode }> = ({
  title,
  action,
}) => (
  <div className="flex items-center justify-between gap-3">
    <h1 className="font-comic font-black text-base sm:text-lg uppercase tracking-tight text-[var(--ink-primary)]">
      {title}
    </h1>
    {action}
  </div>
);

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => (
  <div className="relative flex-1 min-w-0">
    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none z-10" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input-comic pl-9 pr-9 text-sm min-h-[44px]"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Xóa tìm kiếm"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] z-10 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

export interface ChipOption {
  key: string;
  label: string;
  count?: number;
}

export const FilterChips: React.FC<{
  options: ChipOption[];
  value: string;
  onChange: (key: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 pb-1">
    {options.map((o) => {
      const active = o.key === value;
      return (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'btn-comic whitespace-nowrap text-xs py-1.5 px-3 min-h-[36px] shrink-0',
            active && 'btn-comic-yellow'
          )}
        >
          <span>{o.label}</span>
          {o.count !== undefined && (
            <span className="font-mono text-[11px] opacity-70">{o.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

type Tone = 'yellow' | 'blue' | 'teal' | 'purple' | 'red' | 'orange';
const TONE: Record<Tone, string> = {
  yellow: 'bg-[#FFE600] text-[#111113]',
  blue: 'bg-[#3A86FF] text-white',
  teal: 'bg-[#2A9D8F] text-white',
  purple: 'bg-[#8338EC] text-white',
  red: 'bg-[#E63946] text-white',
  orange: 'bg-[#F4A261] text-[#111113]',
};

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  tone?: Tone;
  onClick?: () => void;
}> = ({ label, value, sub, icon: Icon, tone = 'yellow', onClick }) => (
  <div
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    className={cn(
      'card-comic p-3.5 flex flex-col gap-2 min-w-0',
      onClick && 'card-comic-interactive cursor-pointer'
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-extrabold uppercase text-[var(--ink-muted)] truncate">
        {label}
      </span>
      <div
        className={cn(
          'w-8 h-8 rounded-lg border-2 border-[#111113] flex items-center justify-center shadow-comic-sm shrink-0',
          TONE[tone]
        )}
      >
        <Icon className="w-4 h-4" strokeWidth={2.25} />
      </div>
    </div>
    <span className="font-comic font-black text-xl sm:text-2xl text-[var(--ink-primary)] leading-none truncate">
      {value}
    </span>
    {sub && (
      <span className="text-[11px] font-semibold text-[var(--ink-muted)] truncate">{sub}</span>
    )}
  </div>
);

export const EmptyBox: React.FC<{ text: string }> = ({ text }) => (
  <div className="card-comic p-8 text-center text-sm font-bold text-[var(--ink-secondary)]">
    {text}
  </div>
);

export const Spinner: React.FC = () => (
  <div className="flex justify-center py-10">
    <Loader2 className="w-6 h-6 animate-spin text-[var(--ink-muted)]" />
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label className="flex flex-col gap-1">
    <span className="font-extrabold text-[11px] uppercase text-[var(--ink-primary)]">{label}</span>
    {children}
  </label>
);

export const Avatar: React.FC<{
  name: string;
  src?: string;
  tone?: 'ADMIN' | 'VIP' | 'USER';
  size?: number;
}> = ({ name, src, tone = 'USER', size = 40 }) => {
  const bg =
    tone === 'ADMIN' ? 'bg-[#E63946] text-white' : tone === 'VIP' ? 'bg-[#8338EC] text-white' : 'bg-[#FFE600] text-[#111113]';
  return src ? (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      style={{ width: size, height: size }}
      className="rounded-xl border-2 border-[#111113] object-cover shrink-0"
    />
  ) : (
    <div
      style={{ width: size, height: size }}
      className={cn(
        'rounded-xl border-2 border-[#111113] flex items-center justify-center font-black text-xs shrink-0',
        bg
      )}
    >
      {name.substring(0, 2).toUpperCase()}
    </div>
  );
};

/** Bottom sheet trên mobile, hộp thoại giữa màn hình trên desktop. */
export const Sheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ isOpen, onClose, title, children, footer }) => {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center fade-in-comic"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card-comic w-full md:max-w-[560px] max-h-[92dvh] md:max-h-[88dvh] flex flex-col bg-[var(--surface-card)] text-[var(--ink-primary)] rounded-b-none md:rounded-b-[inherit] shadow-comic-lg">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b-2 border-[var(--border-ink)] shrink-0">
          <h3 className="font-extrabold text-sm uppercase truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-3">
          {children}
        </div>
        {footer && (
          <div className="px-4 py-3 border-t-2 border-[var(--border-ink)] shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export const SelectBar: React.FC<{
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}> = ({ count, onClear, children }) => (
  <div className="fixed z-[60] bottom-[92px] md:bottom-5 left-3 right-3 md:left-[300px] md:right-6 max-w-3xl md:mx-auto card-comic bg-[var(--surface-card)] p-2.5 flex items-center gap-2 shadow-comic-lg">
    <button
      type="button"
      onClick={onClear}
      className="btn-comic text-xs py-1.5 px-2.5 min-h-[40px] shrink-0"
    >
      <X className="w-4 h-4" />
      <span className="font-black">{count}</span>
    </button>
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1">{children}</div>
  </div>
);
