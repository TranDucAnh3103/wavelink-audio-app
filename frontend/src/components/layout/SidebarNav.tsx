'use client';

import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Headphones,
  Home,
  Library,
  Plus,
  Users,
  Bell,
  Crown,
  User,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';

export const SidebarNav: React.FC = React.memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLive, isInitialized } = useAuthStore();
  const { theme, resolvedTheme, setTheme } = useThemeStore();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  const pathname = location.pathname;
  const isAdmin = user?.role === 'ADMIN';
  const isVip = user?.role === 'VIP' || user?.membership === 'VIP';
  const displayName = user?.username || (!isInitialized ? '...' : user?.isGuest ? 'Khách' : 'Độc Giả');

  const navItems = [
    {
      to: '/home',
      label: 'Trang chủ',
      icon: Home,
      isActive: pathname === '/' || pathname === '/home',
    },
    {
      to: '/library',
      label: 'Thư viện',
      icon: Library,
      isActive: pathname.startsWith('/library'),
    },
    {
      to: '/community',
      label: 'Cộng đồng',
      icon: Users,
      isActive: pathname.startsWith('/community'),
    },
    {
      to: '/notifications',
      label: 'Thông báo',
      icon: Bell,
      badge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : undefined,
      isActive: pathname.startsWith('/notifications'),
    },
    {
      to: '/membership',
      label: 'Gói VIP',
      icon: Crown,
      isActive: pathname.startsWith('/membership'),
    },
    {
      to: '/profile',
      label: 'Cá nhân',
      icon: User,
      isActive: pathname.startsWith('/profile'),
    },
    ...(isAdmin
      ? [
          {
            to: '/admin',
            label: 'Quản trị',
            icon: ShieldCheck,
            isActive: pathname.startsWith('/admin'),
          },
        ]
      : []),
    {
      to: '/settings',
      label: 'Cài đặt',
      icon: Settings,
      isActive: pathname.startsWith('/settings'),
    },
  ];

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <aside
      aria-label="Thanh điều hướng chính"
      className="hidden md:flex fixed top-0 left-0 bottom-0 z-40 w-[76px] lg:w-60 flex-col bg-[var(--surface-card)] border-r-2 border-[var(--border-ink)] transition-[width] duration-200 select-none"
    >
      {/* Brand Logo */}
      <div className="h-16 px-3 lg:px-4 border-b-2 border-[var(--border-ink)] flex items-center justify-center lg:justify-between shrink-0">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="flex items-center gap-2.5 text-left group cursor-pointer"
          title="Về trang chủ WaveLink"
        >
          <div className="w-10 h-10 rounded-xl border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center shadow-comic-sm group-hover:-translate-y-0.5 transition-transform shrink-0">
            <Headphones className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="hidden lg:flex flex-col min-w-0">
            <span className="font-comic font-black text-base uppercase tracking-tight text-[var(--ink-primary)] leading-none">
              WaveLink
            </span>
            <span className="text-[10px] font-bold text-[var(--ink-muted)] mt-1 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  isLive ? 'bg-[#2A9D8F]' : 'bg-[#F4A261]'
                }`}
              />
              {isLive ? 'Trực tuyến' : 'Ngoại tuyến'}
            </span>
          </div>
        </button>
      </div>

      {/* Primary Upload CTA */}
      <div className="p-3 lg:px-4">
        <button
          type="button"
          onClick={() => navigate('/upload')}
          title="Nhập link YouTube mới"
          className="w-full btn-comic btn-comic-yellow py-2.5 px-0 lg:px-3.5 justify-center font-black text-xs uppercase tracking-wide"
        >
          <Plus className="w-4 h-4 shrink-0" strokeWidth={3} />
          <span className="hidden lg:inline">Nhập Link YouTube</span>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto no-scrollbar px-2.5 lg:px-3 py-1 flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={`relative flex items-center justify-center lg:justify-start gap-3 px-2.5 lg:px-3 py-2.5 rounded-xl font-bold text-xs transition-all border-2 ${
                item.isActive
                  ? 'bg-[#FFE600] text-[#111113] border-[#111113] shadow-comic-sm font-black'
                  : 'border-transparent text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={item.isActive ? 2.5 : 2} />
              <span className="hidden lg:inline truncate">{item.label}</span>
              {item.badge && (
                <span className="lg:ml-auto absolute top-1.5 right-1.5 lg:static min-w-[18px] h-[18px] px-1 rounded-full bg-[#E63946] text-white border border-[#111113] text-[9px] font-black flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Theme & Account Section */}
      <div className="p-3 border-t-2 border-[var(--border-ink)] flex flex-col gap-2 shrink-0">
        {/* Theme Cycle Button */}
        <button
          type="button"
          onClick={cycleTheme}
          title={`Giao diện: ${theme === 'system' ? 'Hệ thống' : theme === 'dark' ? 'Tối' : 'Sáng'} (Nhấn để đổi)`}
          className="w-full flex items-center justify-center lg:justify-between gap-2 px-2.5 py-2 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)] text-[var(--ink-primary)] text-xs font-bold transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            {theme === 'system' ? (
              <Monitor className="w-4 h-4 text-[#3A86FF]" strokeWidth={2.25} />
            ) : resolvedTheme === 'dark' ? (
              <Moon className="w-4 h-4 text-[#FFE600]" strokeWidth={2.25} />
            ) : (
              <Sun className="w-4 h-4 text-[#F4A261]" strokeWidth={2.25} />
            )}
            <span className="hidden lg:inline">
              {theme === 'system' ? 'Theo hệ thống' : resolvedTheme === 'dark' ? 'Dark Ink' : 'Light Paper'}
            </span>
          </span>
          <span className="hidden lg:inline text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--ink-muted)]">
            Đổi
          </span>
        </button>

        {/* User Chip */}
        <button
          type="button"
          onClick={() => navigate(user?.isGuest ? '/login' : '/profile')}
          title={displayName}
          className="w-full flex items-center justify-center lg:justify-start gap-2.5 p-2 rounded-xl border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)] text-left transition-colors cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#3A86FF] text-white flex items-center justify-center font-black text-xs shrink-0 overflow-hidden">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="hidden lg:flex flex-col min-w-0 flex-1">
            <span className="text-xs font-extrabold text-[var(--ink-primary)] truncate">
              {displayName}
            </span>
            <span className="text-[10px] font-bold text-[var(--ink-muted)] truncate">
              {isAdmin ? 'Quản trị viên' : isVip ? 'Thành viên VIP' : user?.isGuest ? 'Đăng nhập ngay' : 'Miễn phí'}
            </span>
          </div>
        </button>
      </div>
    </aside>
  );
});

SidebarNav.displayName = 'SidebarNav';
