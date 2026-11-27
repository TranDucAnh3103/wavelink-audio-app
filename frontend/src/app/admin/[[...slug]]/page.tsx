import React from 'react';
import type { Metadata } from 'next';
import { AdminClientWrapper } from './admin-client';

export const metadata: Metadata = {
  title: 'Bảng Điều Khiển Quản Trị | WaveLink',
  description: 'Trang quản trị hệ thống WaveLink Audio.',
  robots: {
    index: false,
    follow: false,
  },
};

interface PageProps {
  params: {
    slug?: string[];
  };
}

export default function AdminCatchAllPage({ params }: PageProps) {
  return <AdminClientWrapper slug={params.slug} />;
}
