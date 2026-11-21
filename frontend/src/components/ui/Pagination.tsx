import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  className?: string;
  showItemCount?: boolean;
  alwaysShow?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  className = '',
  showItemCount = true,
  alwaysShow = false,
}) => {
  const validTotalPages = Math.max(1, totalPages || 1);
  const validCurrentPage = Math.min(Math.max(1, currentPage || 1), validTotalPages);

  if (!alwaysShow && validTotalPages <= 1 && (!totalItems || totalItems <= (pageSize || 12))) {
    return null;
  }

  const getPageNumbers = (): (number | string)[] => {
    if (validTotalPages <= 1) return [1];

    if (validTotalPages <= 7) {
      const pages: number[] = [];
      for (let i = 1; i <= validTotalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    if (validCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', validTotalPages];
    }

    if (validCurrentPage >= validTotalPages - 3) {
      return [
        1,
        '...',
        validTotalPages - 4,
        validTotalPages - 3,
        validTotalPages - 2,
        validTotalPages - 1,
        validTotalPages,
      ];
    }

    return [
      1,
      '...',
      validCurrentPage - 1,
      validCurrentPage,
      validCurrentPage + 1,
      '...',
      validTotalPages,
    ];
  };

  const pages = getPageNumbers();

  return (
    <div className={`flex flex-col items-center gap-2 pt-3 pb-2 w-full ${className}`}>
      {/* Page Controls */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {/* Prev button */}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, validCurrentPage - 1))}
          disabled={validCurrentPage <= 1}
          className={`btn-comic text-xs py-1 px-2.5 flex items-center gap-1 ${
            validCurrentPage <= 1
              ? 'opacity-40 cursor-not-allowed pointer-events-none'
              : 'cursor-pointer'
          }`}
          title="Trang trước"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
          <span className="hidden sm:inline font-bold">Trước</span>
        </button>

        {/* Number buttons & interactive ellipsis */}
        {pages.map((p, idx) => {
          if (p === '...') {
            const isLeft = idx === 1;
            const jumpTarget = isLeft
              ? Math.max(1, validCurrentPage - 5)
              : Math.min(validTotalPages, validCurrentPage + 5);

            return (
              <button
                key={`ellipsis-${idx}`}
                type="button"
                onClick={() => onPageChange(jumpTarget)}
                className="w-8 h-8 rounded-lg border-2 border-dashed border-[var(--border-ink)]/50 hover:border-[var(--border-ink)] hover:bg-[#FFE600]/20 text-xs font-bold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center justify-center transition-all select-none cursor-pointer"
                title={isLeft ? 'Lùi 5 trang' : 'Tiến 5 trang'}
              >
                ...
              </button>
            );
          }

          const pageNum = Number(p);
          const isActive = pageNum === validCurrentPage;

          return (
            <button
              key={`page-${pageNum}`}
              type="button"
              onClick={() => onPageChange(pageNum)}
              className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-xs font-black transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#FFE600] text-[#111113] border-[#111113] shadow-comic-sm scale-105'
                  : 'bg-[var(--surface-card)] text-[var(--ink-secondary)] border-[var(--border-ink)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {pageNum}
            </button>
          );
        })}

        {/* Next button */}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(validTotalPages, validCurrentPage + 1))}
          disabled={validCurrentPage >= validTotalPages}
          className={`btn-comic text-xs py-1 px-2.5 flex items-center gap-1 ${
            validCurrentPage >= validTotalPages
              ? 'opacity-40 cursor-not-allowed pointer-events-none'
              : 'cursor-pointer'
          }`}
          title="Trang sau"
        >
          <span className="hidden sm:inline font-bold">Sau</span>
          <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>

      {/* Info indicator */}
      {showItemCount && (
        <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--ink-muted)]">
          <span>
            Trang <strong className="text-[var(--ink-primary)]">{validCurrentPage}</strong> / {validTotalPages}
          </span>
          {typeof totalItems === 'number' && (
            <>
              <span>•</span>
              <span>
                Tổng <strong className="text-[var(--ink-primary)]">{totalItems}</strong> mục ({pageSize || 12}/trang)
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
