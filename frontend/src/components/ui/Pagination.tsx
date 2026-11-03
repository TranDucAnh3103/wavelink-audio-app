import React from 'react';

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

  // Generate page numbers with clean windowing
  const getPageNumbers = (): (number | string)[] => {
    if (validTotalPages <= 1) return [1];

    // Hiển thị tất cả các trang nếu <= 7 trang để không bao giờ bị che khuất trang 3, 4, 5
    if (validTotalPages <= 7) {
      const pages: number[] = [];
      for (let i = 1; i <= validTotalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    // Khi có nhiều hơn 7 trang:
    // Trường hợp 1: Đang ở gần đầu (trang 1 -> 4) -> hiển thị 1, 2, 3, 4, 5, '...', validTotalPages
    // Đảm bảo trang 3 luôn luôn xuất hiện và bấm trực tiếp được ngay!
    if (validCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', validTotalPages];
    }

    // Trường hợp 2: Đang ở gần cuối
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

    // Trường hợp 3: Đang ở đoạn giữa
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
          className={`btn-comic text-xs py-1 px-2.5 flex items-center gap-1 bg-white ${
            validCurrentPage <= 1 ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:bg-gray-100 cursor-pointer'
          }`}
          title="Trang trước"
        >
          <i className="ri-arrow-left-s-line text-sm font-bold" />
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
                className="w-8 h-8 rounded border-2 border-dashed border-gray-300 hover:border-black hover:bg-[#FFE600]/30 text-xs font-bold text-gray-500 hover:text-black flex items-center justify-center transition-all select-none cursor-pointer"
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
              className={`w-8 h-8 rounded border-2 border-black flex items-center justify-center text-xs font-black transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#FFE600] text-black shadow-comic-sm scale-105'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
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
          className={`btn-comic text-xs py-1 px-2.5 flex items-center gap-1 bg-white ${
            validCurrentPage >= validTotalPages ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:bg-gray-100 cursor-pointer'
          }`}
          title="Trang sau"
        >
          <span className="hidden sm:inline font-bold">Sau</span>
          <i className="ri-arrow-right-s-line text-sm font-bold" />
        </button>
      </div>

      {/* Info indicator */}
      {showItemCount && (
        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500">
          <span>
            Trang <strong className="text-black">{validCurrentPage}</strong> / {validTotalPages}
          </span>
          {typeof totalItems === 'number' && (
            <>
              <span>•</span>
              <span>
                Tổng <strong className="text-black">{totalItems}</strong> mục ({pageSize || 12}/trang)
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
