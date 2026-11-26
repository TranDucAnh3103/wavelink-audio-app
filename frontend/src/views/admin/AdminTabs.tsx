'use client';

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Receipt,
  Crown,
  BookOpen,
  Scissors,
  Tags,
  MessageSquare,
  Bell,
  LifeBuoy,
  Sliders,
  Settings,
} from 'lucide-react';

export interface AdminTabsProps {
  activeTab:
    | 'overview'
    | 'users'
    | 'orders'
    | 'vip'
    | 'audios'
    | 'episodes'
    | 'categories'
    | 'community'
    | 'tickets'
    | 'notify'
    | 'system'
    | 'settings';
}

export const ADMIN_TABS = [
  { key: 'overview', to: '/admin', end: true, label: 'Tổng quan', icon: LayoutDashboard },
  { key: 'users', to: '/admin/users', label: 'Người dùng', icon: Users },
  { key: 'orders', to: '/admin/orders', label: 'Đơn hàng', icon: Receipt },
  { key: 'vip', to: '/admin/vip', label: 'Gói VIP', icon: Crown },
  { key: 'audios', to: '/admin/audios', label: 'Kho audio', icon: BookOpen },
  { key: 'episodes', to: '/admin/episodes', label: 'Phân tập', icon: Scissors },
  { key: 'categories', to: '/admin/categories', label: 'Danh mục', icon: Tags },
  { key: 'community', to: '/admin/community', label: 'Cộng đồng', icon: MessageSquare },
  { key: 'tickets', to: '/admin/tickets', label: 'Yêu cầu', icon: LifeBuoy },
  { key: 'notify', to: '/admin/notify', label: 'Thông báo', icon: Bell },
  { key: 'system', to: '/admin/system', label: 'Hệ thống', icon: Sliders },
  { key: 'settings', to: '/settings', label: 'Cài đặt', icon: Settings },
] as const;

export const AdminTabs: React.FC<AdminTabsProps> = ({ activeTab }) => {
  return (
    <nav
      aria-label="Điều hướng quản trị"
      className="w-full bg-[var(--surface-card)] border-b-2 border-[var(--border-ink)] mb-4 sticky top-14 md:top-16 z-20"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-1.5 px-4 md:px-6 py-2 overflow-x-auto no-scrollbar">
        {ADMIN_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={'end' in tab ? tab.end : false}
              aria-current={isActive ? 'page' : undefined}
              className={`btn-comic text-xs py-1.5 px-3 min-h-[38px] whitespace-nowrap shrink-0 ${
                isActive ? 'btn-comic-yellow' : ''
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2.25} />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
