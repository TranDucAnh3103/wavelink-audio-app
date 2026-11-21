'use client';

import React, { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { AdminOverviewSkeleton } from '@/components/common/Skeletons';

export const AdminGuard: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { user, isLoading, isInitialized } = useAuthStore();

  const isAuthBlocking =
    !user &&
    (isLoading ||
      (!isInitialized &&
        Boolean(typeof localStorage !== 'undefined' && localStorage.getItem('auth_token'))));
  const showSkeletonFallback = useDelayedFallback(isAuthBlocking, 180);

  const isDenied = !isAuthBlocking && user?.role !== 'ADMIN';

  useEffect(() => {
    if (isDenied) {
      toast.error(
        'Permission Denied: Không thể truy cập! Khu vực này chỉ dành riêng cho Quản trị viên (ADMIN).'
      );
    }
  }, [isDenied]);

  if (showSkeletonFallback) {
    return <AdminOverviewSkeleton />;
  }

  if (isAuthBlocking) {
    return <div className="w-full max-w-7xl mx-auto min-h-[60vh]" />;
  }

  if (isDenied) {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center p-4 min-h-[65vh] fade-in-comic">
        <div className="card-comic p-6 sm:p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl border-2 border-[#111113] bg-[#E63946] text-white flex items-center justify-center shadow-comic-sm animate-bounce">
            <ShieldAlert className="w-8 h-8" strokeWidth={2.5} />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="badge-comic badge-comic-red text-[11px] mx-auto uppercase tracking-wider font-extrabold px-3 py-0.5">
              Permission Denied
            </span>
            <h2 className="font-black text-xl uppercase text-[var(--ink-primary)] mt-1">
              Không thể truy cập
            </h2>
            <p className="text-xs font-medium text-[var(--ink-secondary)] leading-relaxed">
              Bạn không có quyền quản trị viên (ADMIN) để truy cập vào trang này. Toàn bộ tính năng quản trị đã bị khóa bảo vệ.
            </p>
          </div>

          <div className="p-3 bg-[var(--surface-elevated)] border border-[var(--border-ink)] rounded-xl w-full text-left text-xs font-mono text-[var(--ink-secondary)] flex flex-col gap-1.5 shadow-comic-sm">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[var(--ink-primary)]">Tài khoản:</span>
              <span className="truncate max-w-[180px] font-semibold">
                {user?.username || 'Chưa đăng nhập / Khách'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-bold text-[var(--ink-primary)]">Vai trò hiện tại:</span>
              <span className="badge-comic badge-comic-yellow text-[10px] px-2 py-0 font-bold">
                {user?.role || 'GUEST'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-bold text-[var(--ink-primary)]">Quyền yêu cầu:</span>
              <span className="badge-comic badge-comic-teal text-[10px] px-2 py-0 font-bold">
                ADMIN
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full mt-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1 font-bold"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1 font-bold"
              onClick={() => navigate('/home')}
            >
              Về Trang Chủ
            </Button>
          </div>

          {(!user || user?.isGuest) && (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-xs font-bold text-[#3A86FF] hover:underline mt-1 flex items-center gap-1 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập bằng tài khoản Quản trị viên →</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
};
