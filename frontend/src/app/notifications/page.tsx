import React from 'react';
import type { Metadata } from 'next';
import { NotificationsPage } from '@/pages/NotificationsPage';

export const metadata: Metadata = {
  title: 'Thông Báo | WaveLink',
  description: 'Xem các thông báo mới nhất về audio, tập mới và tài khoản WaveLink.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotificationsRoutePage() {
  return <NotificationsPage />;
}
