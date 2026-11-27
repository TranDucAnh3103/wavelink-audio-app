import React from 'react';
import type { Metadata } from 'next';
import { ProfilePage } from '@/pages/ProfilePage';

export const metadata: Metadata = {
  title: 'Hồ Sơ Cá Nhân | WaveLink',
  description: 'Quản lý tài khoản, lịch sử nghe và danh sách audio cá nhân trên WaveLink.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileRoutePage() {
  return <ProfilePage />;
}
