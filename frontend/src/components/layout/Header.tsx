'use client';

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Search, Bell, Settings, Sun, Moon, User } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';

export const Header: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { user, isLive, isInitialized } = useAuthStore();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const [quickQuery, setQuickQuery] = useState('');

  const displayName = user?.username || (!isInitialized ? '...' : user?.isGuest ? 'Khách' : 'Độc Giả');

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickQuery.trim();
    if (trimmed) {
      navigate(`/library?search=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/library');
    }
  };

  return (
    <header className="fixed top-0 left-0 md:left-[76px] lg:left-60 right-0 z-30 bg-[var(--surface-card)]/95 backdrop-blur-md border-b-2 border-[var(--border-ink)] pt-safe transition-colors">
      <div className="h-14 md:h-16 px-3 sm:px-4 md:px-6 max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Mobile Brand Logo (hidden on md+ since SidebarNav shows it) */}
        <div
          className="flex md:hidden items-center gap-2 cursor-pointer select-none min-w-0"
          onClick={() => navigate('/home')}
        >
          <div className="w-8 h-8 rounded-lg border-2 border-[#111113] bg-[#FFE600] text-[#111113] flex items-center justify-center font-black shadow-comic-sm shrink-0">
            <Headphones className="w-4 h-4" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-comic font-extrabold text-sm uppercase tracking-tight text-[var(--ink-primary)] leading-tight flex items-center gap-1.5">
              WaveLink
              <span
                title={isLive ? 'Kết nối máy chủ ổn định' : 'Đang ở chế độ ngoại tuyến'}
                className={`inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-[#111113] ${
                  isLive ? 'bg-[#2A9D8F] text-white' : 'bg-[#F4A261] text-[#111113]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {isLive ? 'LIVE' : 'OFF'}
              </span>
            </span>
            <span className="text-[10px] font-bold text-[var(--ink-muted)] truncate leading-tight">
              <strong className="font-extrabold text-[var(--ink-primary)]">{displayName}</strong> trực tuyến
            </span>
          </div>
        </div>

        {/* Tablet/Desktop Inline Search Bar */}
        <form
          onSubmit={handleQuickSearch}
          className="hidden md:flex items-center flex-1 max-w-md relative"
        >
          <Search
            className="w-4 h-4 text-[var(--ink-muted)] absolute left-3 pointer-events-none"
            strokeWidth={2.25}
          />
          <input
            type="search"
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            placeholder="Tìm audio, sách nói, tác giả, link YouTube..."
            className="input-comic pl-9 pr-16 py-1.5 text-xs h-9"
          />
          <button
            type="submit"
            className="absolute right-1.5 px-2.5 py-1 rounded-md bg-[#FFE600] text-[#111113] border border-[#111113] text-[10px] font-black uppercase hover:bg-yellow-300 transition-colors cursor-pointer"
          >
            Tìm
          </button>
        </form>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Search Trigger */}
          <button
            type="button"
            onClick={() => navigate('/library')}
            aria-label="Tìm kiếm"
            title="Tìm kiếm trong Thư viện"
            className="md:hidden w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Search className="w-4 h-4" strokeWidth={2.25} />
          </button>

          {/* Theme Quick Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={resolvedTheme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
            title={resolvedTheme === 'dark' ? 'Đang bật Dark Ink — Nhấn để chuyển Light Paper' : 'Đang bật Light Paper — Nhấn để chuyển Dark Ink'}
            className="w-9 h-9 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] flex items-center justify-center text-[var(--ink-primary)] shadow-comic-sm hover:bg-[var(--surface-muted)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer transition-colors"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4 text-[#FFE600]" strokeWidth={2.25} />
            ) : (
              <Moon className="w-4 h-4 text-[#8338EC]" strokeWidth={2.25} />
            )}
          </button>

          {/* Notifications Bell */}
          <button
            type="button"
            onClick={() => navigate('/notifications')}
            id="header-bell-btn"
            aria-label="Thông báo"
            title="Thông báo"
            className="relative w-9 h-9 rounded-lg border-2 border-[#111113] bg-[#FFE600] flex items-center justify-center text-[#111113] shadow-comic-sm hover:bg-yellow-300 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Bell className="w-4 h-4" strokeWidth={2.5} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] bg-[#E63946] text-white text-[9px] font-black rounded-full border border-[#111113] flex items-center justify-center px-0.5">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => navigate('/settings')}
            aria-label="Cài đặt"
            title="Cài đặt"
            className="w-9 h-9 rounded-lg border-2 border-[#111113] bg-[#8338EC] flex items-center justify-center text-white shadow-comic-sm hover:bg-purple-600 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Settings className="w-4 h-4" strokeWidth={2.25} />
          </button>

          {/* Desktop Quick Profile Chip */}
          <button
            type="button"
            onClick={() => navigate(user?.isGuest ? '/login' : '/profile')}
            className="hidden md:inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-lg border-2 border-[var(--border-ink)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)] text-[var(--ink-primary)] text-xs font-extrabold shadow-comic-sm cursor-pointer transition-colors"
            title={user?.isGuest ? 'Đăng nhập / Đăng ký' : 'Trang cá nhân'}
          >
            <span className="w-6 h-6 rounded-md bg-[#3A86FF] text-white border border-[#111113] flex items-center justify-center overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-3.5 h-3.5" strokeWidth={2.5} />
              )}
            </span>
            <span className="max-w-[100px] truncate">{displayName}</span>
          </button>
        </div>
      </div>
    </header>
  );
});

Header.displayName = 'Header';
