'use client';

import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Library, Plus, LayoutDashboard, Users, User } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

export const Footer: React.FC = React.memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const pathname = location.pathname;

  const isAdmin = user?.role === 'ADMIN';

  const isHomeActive = pathname === '/' || pathname === '/home';
  const isLibraryActive = pathname.startsWith('/library');
  const isAdminActive = pathname.startsWith('/admin') || pathname === '/settings';
  const isCommunityActive = pathname === '/community';
  const isProfileActive = pathname.startsWith('/profile');

  return (
    <nav className="bottom-nav-comic pb-safe md:hidden" aria-label="Điều hướng di động">
      <div className="relative flex justify-around items-center h-[62px] px-1.5">
        {/* Tab 1: Trang chủ */}
        <NavLink
          to="/home"
          className={`nav-tab-comic ${isHomeActive ? 'active' : ''}`}
        >
          <Home className="w-5 h-5" strokeWidth={isHomeActive ? 2.5 : 2} />
          <span>Trang chủ</span>
        </NavLink>

        {/* Tab 2: Thư viện */}
        <NavLink
          to="/library"
          className={`nav-tab-comic ${isLibraryActive ? 'active' : ''}`}
        >
          <Library className="w-5 h-5" strokeWidth={isLibraryActive ? 2.5 : 2} />
          <span>Thư viện</span>
        </NavLink>

        {/* Center Raised Comic FAB: Nhập link YouTube */}
        <div className="relative flex flex-col items-center justify-end flex-1 pb-1.5">
          <button
            type="button"
            onClick={() => navigate('/upload')}
            aria-label="Nhập link YouTube"
            className="fab-comic"
            title="Nhập link YouTube"
          >
            <Plus className="w-6 h-6" strokeWidth={3} />
          </button>
          <span className="text-[10px] font-black uppercase text-[var(--ink-primary)] tracking-tight leading-none -mt-2">
            Nhập Link
          </span>
        </div>

        {/* Tab 4: Cộng đồng hoặc Quản lý (Admin) */}
        {isAdmin ? (
          <NavLink
            to="/admin"
            className={`nav-tab-comic ${isAdminActive ? 'active' : ''}`}
          >
            <LayoutDashboard className="w-5 h-5" strokeWidth={isAdminActive ? 2.5 : 2} />
            <span>Quản trị</span>
          </NavLink>
        ) : (
          <NavLink
            to="/community"
            className={`nav-tab-comic ${isCommunityActive ? 'active' : ''}`}
          >
            <Users className="w-5 h-5" strokeWidth={isCommunityActive ? 2.5 : 2} />
            <span>Cộng đồng</span>
          </NavLink>
        )}

        {/* Tab 5: Cá nhân */}
        <NavLink
          to="/profile"
          className={`nav-tab-comic ${isProfileActive ? 'active' : ''}`}
        >
          <User className="w-5 h-5" strokeWidth={isProfileActive ? 2.5 : 2} />
          <span>Cá nhân</span>
        </NavLink>
      </div>
    </nav>
  );
});

Footer.displayName = 'Footer';
