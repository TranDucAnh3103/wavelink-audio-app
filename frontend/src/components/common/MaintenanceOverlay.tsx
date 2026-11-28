import React, { useEffect } from 'react';
import { Wrench, RefreshCw, LogIn } from 'lucide-react';
import { useSiteStatusStore } from '@/stores/siteStatusStore';
import { useAuthStore } from '@/stores/authStore';
import { axiosClient } from '@/lib/axiosClient';

export const MaintenanceOverlay: React.FC = () => {
  const { maintenanceMode, maintenanceMessage, setSiteStatus } = useSiteStatusStore();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const allowBypassPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/admin');

  const checkStatus = async () => {
    try {
      const res = await axiosClient.get('/site-status', { timeout: 6000 });
      const data = res.data?.data ?? res.data;
      if (data && typeof data === 'object') {
        setSiteStatus({
          maintenanceMode: Boolean(data.maintenanceMode),
          maintenanceMessage: data.maintenanceMessage || '',
          allowUserImport: data.allowUserImport ?? true,
          allowGuestChat: data.allowGuestChat ?? true,
        });
      }
    } catch {
      // Ignore network errors while checking status
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  if (!maintenanceMode || isAdmin || allowBypassPath) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[99990] bg-[var(--surface-bg)]/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="card-comic max-w-md w-full p-6 bg-[var(--surface-card)] text-center flex flex-col items-center gap-4 border-2 border-[var(--border-ink)]">
        <div className="w-14 h-14 rounded-2xl bg-[#FFE600] border-2 border-[#111113] flex items-center justify-center shadow-comic-sm">
          <Wrench className="w-7 h-7 text-[#111113]" />
        </div>
        <h2 className="font-display font-black text-lg uppercase text-[var(--ink-primary)]">
          Hệ thống đang bảo trì
        </h2>
        <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
          {maintenanceMessage || 'WaveLink đang được nâng cấp để phục vụ tốt hơn. Vui lòng quay lại sau ít phút.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={checkStatus}
            className="btn-comic-primary text-xs px-4 py-2 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Thử lại
          </button>
          <a
            href="/login"
            className="btn-comic-default text-xs px-4 py-2 flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            Đăng nhập Admin
          </a>
        </div>
      </div>
    </div>
  );
};
