'use client';

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Scissors,
  Tags,
  Users,
  Crown,
  MessageSquare,
  Settings,
} from 'lucide-react';

export interface AdminTabsProps {
  activeTab:
    | 'overview'
    | 'audios'
    | 'episodes'
    | 'categories'
    | 'accounts'
    | 'vip'
    | 'community'
    | 'settings';
}

export const AdminTabs: React.FC<AdminTabsProps> = ({ activeTab }) => {
  const tabs = [
    { key: 'overview', to: '/admin', end: true, label: 'Tổng quan', icon: LayoutDashboard },
    { key: 'audios', to: '/admin/audios', label: 'Kho Audio', icon: BookOpen },
    { key: 'episodes', to: '/admin/episodes', label: 'Phân Tập', icon: Scissors },
    { key: 'categories', to: '/admin/categories', label: 'Thể loại & Thẻ', icon: Tags },
    { key: 'accounts', to: '/admin/accounts', label: 'Tài khoản', icon: Users },
    { key: 'vip', to: '/admin/vip', label: 'Gói VIP & VietQR', icon: Crown, iconColor: 'text-[#8338EC]' },
    { key: 'community', to: '/admin/community', label: 'Cộng Đồng', icon: MessageSquare, iconColor: 'text-[#3A86FF]' },
    { key: 'settings', to: '/settings', label: 'Cài đặt', icon: Settings },
  ] as const;

  return (
    <div className="w-full bg-[var(--surface-card)] border-b-2 border-[var(--border-ink)] shadow-comic-sm mb-4 sticky top-14 md:top-16 z-20">
      <div className="max-w-7xl mx-auto flex items-center gap-1.5 px-4 md:px-6 py-2.5 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={'end' in tab ? tab.end : false}
              className={`btn-comic text-[11px] py-1.5 px-3 whitespace-nowrap ${
                isActive ? 'btn-comic-yellow' : ''
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 ${!isActive && 'iconColor' in tab ? tab.iconColor : ''}`}
                strokeWidth={2.25}
              />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};
