import React, { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { HomePage } from '@/pages/HomePage';
import { AdminGuard } from '@/components/admin/AdminGuard';

const LibraryPage = lazy(() =>
  import('@/pages/LibraryPage').then((m) => ({ default: m.LibraryPage }))
);
const PlayerPage = lazy(() =>
  import('@/pages/PlayerPage').then((m) => ({ default: m.PlayerPage }))
);
const UploadPage = lazy(() => import('@/pages/UploadPage').then((m) => ({ default: m.UploadPage })));
const CommunityPage = lazy(() =>
  import('@/pages/CommunityPage').then((m) => ({ default: m.CommunityPage }))
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const MembershipPage = lazy(() =>
  import('@/pages/MembershipPage').then((m) => ({ default: m.MembershipPage }))
);
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const AuthPage = lazy(() => import('@/pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const AdminOverviewPage = lazy(() =>
  import('@/pages/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage }))
);
const AdminAudiosPage = lazy(() =>
  import('@/pages/admin/AdminAudiosPage').then((m) => ({ default: m.AdminAudiosPage }))
);
const AdminEpisodesPage = lazy(() =>
  import('@/pages/admin/AdminEpisodesPage').then((m) => ({ default: m.AdminEpisodesPage }))
);
const AdminCategoriesPage = lazy(() =>
  import('@/pages/admin/AdminCategoriesPage').then((m) => ({ default: m.AdminCategoriesPage }))
);
const AdminAccountsPage = lazy(() =>
  import('@/pages/admin/AdminAccountsPage').then((m) => ({ default: m.AdminAccountsPage }))
);
const AdminVipPage = lazy(() =>
  import('@/pages/admin/AdminVipPage').then((m) => ({ default: m.AdminVipPage }))
);
const AdminCommunityPage = lazy(() =>
  import('@/pages/admin/AdminCommunityPage').then((m) => ({ default: m.AdminCommunityPage }))
);
const AdminOrdersPage = lazy(() =>
  import('@/pages/admin/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage }))
);
const AdminNotifyPage = lazy(() =>
  import('@/pages/admin/AdminNotifyPage').then((m) => ({ default: m.AdminNotifyPage }))
);
const AdminTicketsPage = lazy(() =>
  import('@/pages/admin/AdminTicketsPage').then((m) => ({ default: m.AdminTicketsPage }))
);
const AdminSystemPage = lazy(() =>
  import('@/pages/admin/AdminSystemPage').then((m) => ({ default: m.AdminSystemPage }))
);

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:id" element={<ProfilePage />} />
        <Route path="/membership" element={<MembershipPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />

        {/* Admin Routes - Protected with AdminGuard */}
        <Route element={<AdminGuard />}>
          <Route path="/admin" element={<AdminOverviewPage />} />
          <Route path="/admin/audios" element={<AdminAudiosPage />} />
          <Route path="/admin/episodes" element={<AdminEpisodesPage />} />
          <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          <Route path="/admin/users" element={<AdminAccountsPage />} />
          <Route path="/admin/accounts" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin/orders" element={<AdminOrdersPage />} />
          <Route path="/admin/tickets" element={<AdminTicketsPage />} />
          <Route path="/admin/notify" element={<AdminNotifyPage />} />
          <Route path="/admin/system" element={<AdminSystemPage />} />
          <Route path="/admin/vip" element={<AdminVipPage />} />
          <Route path="/admin/community" element={<AdminCommunityPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
};
