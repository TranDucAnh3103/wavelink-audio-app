'use client';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  Plus,
  BookOpen,
  ArrowRight,
  Scissors,
  Tags,
  Users,
  Crown,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useStats } from '@/hooks/useStats';
import { useCategories } from '@/hooks/useCategories';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';
import { AdminTabs } from './AdminTabs';
import { Button } from '@/components/ui/Button';
import { AdminOverviewSkeleton } from '@/components/common/Skeletons';

export const AdminOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading, isInitialized } = useAuthStore();
  const { data: stats } = useStats();
  const { data: categories = [] } = useCategories();

  const isAuthBlocking =
    !user &&
    (isLoading ||
      (!isInitialized &&
        Boolean(typeof localStorage !== 'undefined' && localStorage.getItem('auth_token'))));
  const showSkeletonFallback = useDelayedFallback(isAuthBlocking, 180);

  if (showSkeletonFallback) {
    return <AdminOverviewSkeleton />;
  }

  if (isAuthBlocking) {
    return <div className="w-full max-w-7xl mx-auto min-h-[60vh]" />;
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="card-comic p-8 m-4 max-w-md mx-auto text-center flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl border-2 border-[#111113] bg-[#E63946] text-white flex items-center justify-center shadow-comic-sm">
          <Ban className="w-6 h-6" strokeWidth={2.5} />
        </div>
        <h3 className="font-extrabold text-sm uppercase text-[var(--ink-primary)]">
          Quyền Truy Cập Bị Từ Chối
        </h3>
        <p className="text-xs font-medium text-[var(--ink-secondary)]">
          Trang này chỉ dành riêng cho Quản trị viên hệ thống (Role: ADMIN).
        </p>
        <Button variant="primary" size="sm" onClick={() => navigate('/home')}>
          Về Trang Chủ
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-36 md:pb-28 fade-in-comic">
      <AdminTabs activeTab="overview" />

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-5">
        {/* Management Header */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="badge-comic badge-comic-teal text-[10px]">
              <CheckCircle2 className="w-3 h-3" /> HỆ THỐNG WAVELINK
            </span>
            <span className="badge-comic badge-comic-white text-[10px] font-mono">v1.0.1</span>
          </div>

          <div className="card-comic p-4 md:p-5 bg-[#FFE600] text-[#111113] flex items-center justify-between gap-3 flex-wrap border-2 border-[#111113]">
            <div className="flex flex-col">
              <h1 className="font-comic font-extrabold text-lg md:text-xl uppercase tracking-tight text-[#111113]">
                Trung Tâm Quản Trị
              </h1>
              <p className="text-xs font-bold text-[#111113]/80">
                Giám sát tổng thể kho audio, phân tập logic và người dùng
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/upload')}
              className="btn-comic btn-comic-primary text-xs py-2 px-3.5 shrink-0"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span>Thêm Audio</span>
            </button>
          </div>
        </section>

        {/* KPI Grid (4 columns on Desktop) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div
            onClick={() => navigate('/admin/audios')}
            className="card-comic p-4 flex flex-col justify-between card-comic-interactive"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase text-[var(--ink-muted)]">
                Kho Audio
              </span>
              <div className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#3A86FF] text-white flex items-center justify-center shadow-comic-sm">
                <BookOpen className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 my-1">
              <span className="font-comic font-extrabold text-2xl text-[var(--ink-primary)] leading-none">
                {stats?.totalAudios || 0}
              </span>
              <span className="badge-comic badge-comic-yellow text-[8px] py-0 px-1 font-bold">
                BẢN GHI
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-extrabold text-[#3A86FF] pt-2 border-t-2 border-[var(--border-ink)]/30 mt-2">
              <span>Vào quản lý</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          <div
            onClick={() => navigate('/admin/episodes')}
            className="card-comic p-4 flex flex-col justify-between card-comic-interactive"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase text-[var(--ink-muted)]">
                Phân Tập Logic
              </span>
              <div className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#2A9D8F] text-white flex items-center justify-center shadow-comic-sm">
                <Scissors className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 my-1">
              <span className="font-comic font-extrabold text-2xl text-[var(--ink-primary)] leading-none">
                {stats?.totalEpisodes || 0}
              </span>
              <span className="badge-comic badge-comic-teal text-[8px] py-0 px-1 font-bold">
                TẬP
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-extrabold text-[#2A9D8F] pt-2 border-t-2 border-[var(--border-ink)]/30 mt-2">
              <span>Xem phân đoạn</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          <div
            onClick={() => navigate('/admin/categories')}
            className="card-comic p-4 flex flex-col justify-between card-comic-interactive"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase text-[var(--ink-muted)]">
                Thể Loại & Thẻ
              </span>
              <div className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#F4A261] text-[#111113] flex items-center justify-center shadow-comic-sm">
                <Tags className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 my-1">
              <span className="font-comic font-extrabold text-2xl text-[var(--ink-primary)] leading-none">
                {categories.length}
              </span>
              <span className="badge-comic badge-comic-orange text-[8px] py-0 px-1 font-bold">
                DANH MỤC
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-extrabold text-[#E07A2B] pt-2 border-t-2 border-[var(--border-ink)]/30 mt-2">
              <span>Xem danh mục</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          <div
            onClick={() => navigate('/admin/accounts')}
            className="card-comic p-4 flex flex-col justify-between card-comic-interactive"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase text-[var(--ink-muted)]">
                Tài Khoản
              </span>
              <div className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#8338EC] text-white flex items-center justify-center shadow-comic-sm">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 my-1">
              <span className="font-comic font-extrabold text-2xl text-[var(--ink-primary)] leading-none">
                RBAC
              </span>
              <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-bold">
                4 CẤP
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-extrabold text-[#8338EC] pt-2 border-t-2 border-[var(--border-ink)]/30 mt-2">
              <span>Phân quyền</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </section>

        {/* Secondary Shortcuts (2 columns on Desktop) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div
            onClick={() => navigate('/admin/vip')}
            className="card-comic p-4 flex items-center justify-between card-comic-interactive"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center text-[#111113] shadow-comic-sm shrink-0">
                <Crown className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                    Cấu Hình Gói VIP & VietQR
                  </span>
                  <span className="badge-comic badge-comic-purple text-[8px] py-0 px-1 font-black">
                    MỚI
                  </span>
                </div>
                <span className="text-[11px] font-medium text-[var(--ink-secondary)]">
                  Quản lý bảng giá gói, thông tin tài khoản ngân hàng và chính sách cộng dồn
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--ink-primary)] shrink-0" />
          </div>

          <div
            onClick={() => navigate('/settings')}
            className="card-comic p-4 flex items-center justify-between card-comic-interactive"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm shrink-0">
                <Settings className="w-5 h-5" strokeWidth={2.25} />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-xs sm:text-sm uppercase text-[var(--ink-primary)]">
                  Cài Đặt Hệ Thống & Bộ Nhớ Cache
                </span>
                <span className="text-[11px] font-medium text-[var(--ink-secondary)]">
                  SQLite WAL, Offline Queue & Audio Embed Quality
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--ink-primary)] shrink-0" />
          </div>
        </section>
      </div>
    </div>
  );
};
