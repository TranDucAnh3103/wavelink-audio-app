import React from 'react';
import {
  SearchX,
  BookOpen,
  BellOff,
  MessageSquare,
  Headphones,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface EmptyStateProps {
  icon?: React.ReactNode | string;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

function renderIcon(icon?: React.ReactNode | string) {
  if (!icon) return <SearchX className="w-6 h-6 text-[var(--ink-primary)]" strokeWidth={2.25} />;
  if (typeof icon !== 'string') return icon;

  if (icon.includes('bell')) return <BellOff className="w-6 h-6 text-[var(--ink-primary)]" strokeWidth={2.25} />;
  if (icon.includes('book')) return <BookOpen className="w-6 h-6 text-[var(--ink-primary)]" strokeWidth={2.25} />;
  if (icon.includes('chat') || icon.includes('message')) {
    return <MessageSquare className="w-6 h-6 text-[var(--ink-primary)]" strokeWidth={2.25} />;
  }
  if (icon.includes('headphone') || icon.includes('disc')) {
    return <Headphones className="w-6 h-6 text-[var(--ink-primary)]" strokeWidth={2.25} />;
  }
  if (icon.includes('inbox')) return <Inbox className="w-6 h-6 text-[var(--ink-primary)]" strokeWidth={2.25} />;
  return <SearchX className="w-6 h-6 text-[var(--ink-primary)]" strokeWidth={2.25} />;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
}) => {
  return (
    <div className="card-comic p-6 md:p-8 text-center flex flex-col items-center gap-3 bg-[var(--surface-card)] my-3 fade-in-comic">
      <div className="w-14 h-14 rounded-2xl border-2 border-[var(--border-ink)] bg-[var(--surface-muted)] flex items-center justify-center shadow-comic-sm">
        {renderIcon(icon)}
      </div>
      <h3 className="font-extrabold text-base text-[var(--ink-primary)] uppercase tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-xs sm:text-sm font-medium text-[var(--ink-secondary)] max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {actionText && onAction && (
        <Button variant="primary" size="sm" onClick={onAction} className="mt-1">
          {actionText}
        </Button>
      )}
    </div>
  );
};
