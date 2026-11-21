import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Đang tải dữ liệu...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center gap-3 bg-[var(--surface-card)]/80 backdrop-blur-md rounded-2xl border-2 border-[var(--border-ink)] shadow-comic-sm my-2 fade-in-comic">
      <div className="w-12 h-12 rounded-2xl border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center shadow-comic-sm">
        <Loader2 className="w-6 h-6 text-[#111113] animate-spin" strokeWidth={2.5} />
      </div>
      <span className="text-xs font-bold text-[var(--ink-secondary)]">{message}</span>
    </div>
  );
};
