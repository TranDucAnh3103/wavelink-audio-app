import React from 'react';
import type { Metadata } from 'next';
import { AuthPage } from '@/pages/AuthPage';

export const metadata: Metadata = {
  title: 'Đăng Nhập | WaveLink',
  description: 'Đăng nhập tài khoản WaveLink để đồng bộ tiến trình nghe audio trên mọi thiết bị.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginRoutePage() {
  return <AuthPage />;
}
