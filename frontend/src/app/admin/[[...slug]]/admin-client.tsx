'use client';

import React from 'react';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage';
import { AdminAudiosPage } from '@/pages/admin/AdminAudiosPage';
import { AdminEpisodesPage } from '@/pages/admin/AdminEpisodesPage';
import { AdminCategoriesPage } from '@/pages/admin/AdminCategoriesPage';
import { AdminAccountsPage } from '@/pages/admin/AdminAccountsPage';
import { AdminOrdersPage } from '@/pages/admin/AdminOrdersPage';
import { AdminVipPage } from '@/pages/admin/AdminVipPage';
import { AdminCommunityPage } from '@/pages/admin/AdminCommunityPage';
import { AdminTicketsPage } from '@/pages/admin/AdminTicketsPage';
import { AdminNotifyPage } from '@/pages/admin/AdminNotifyPage';
import { AdminSystemPage } from '@/pages/admin/AdminSystemPage';

interface AdminClientWrapperProps {
  slug?: string[];
}

export function AdminClientWrapper({ slug = [] }: AdminClientWrapperProps) {
  const subPath = slug[0] || 'overview';

  let pageContent: React.ReactNode;
  switch (subPath) {
    case 'audios':
      pageContent = <AdminAudiosPage />;
      break;
    case 'episodes':
      pageContent = <AdminEpisodesPage />;
      break;
    case 'categories':
      pageContent = <AdminCategoriesPage />;
      break;
    case 'users':
    case 'accounts':
      pageContent = <AdminAccountsPage />;
      break;
    case 'orders':
      pageContent = <AdminOrdersPage />;
      break;
    case 'vip':
      pageContent = <AdminVipPage />;
      break;
    case 'community':
      pageContent = <AdminCommunityPage />;
      break;
    case 'tickets':
      pageContent = <AdminTicketsPage />;
      break;
    case 'notify':
      pageContent = <AdminNotifyPage />;
      break;
    case 'system':
      pageContent = <AdminSystemPage />;
      break;
    case 'overview':
    default:
      pageContent = <AdminOverviewPage />;
      break;
  }

  return <AdminGuard>{pageContent}</AdminGuard>;
}
