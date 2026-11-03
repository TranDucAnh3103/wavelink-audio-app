/**
 * WaveLink Global Pagination Configuration
 * Default: 12 items per page as requested by user.
 * Configurable via env variable: NEXT_PUBLIC_ITEMS_PER_PAGE or VITE_ITEMS_PER_PAGE
 */
export const getPageSize = (): number => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const metaVal = Number(
      (import.meta as any).env.VITE_ITEMS_PER_PAGE ||
      (import.meta as any).env.VITE_PAGE_SIZE ||
      (import.meta as any).env.NEXT_PUBLIC_ITEMS_PER_PAGE ||
      (import.meta as any).env.NEXT_PUBLIC_PAGE_SIZE
    );
    if (!isNaN(metaVal) && metaVal > 0) return metaVal;
  }
  if (typeof process !== 'undefined' && process.env) {
    const val = Number(
      process.env.NEXT_PUBLIC_ITEMS_PER_PAGE ||
      process.env.NEXT_PUBLIC_PAGE_SIZE ||
      process.env.VITE_ITEMS_PER_PAGE ||
      process.env.VITE_PAGE_SIZE
    );
    if (!isNaN(val) && val > 0) return val;
  }
  return 12;
};

export const DEFAULT_PAGE_SIZE = getPageSize();

export const getNotificationPageSize = (): number => {
  return getPageSize();
};

export const NOTIFICATION_PAGE_SIZE = getNotificationPageSize();
