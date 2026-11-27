import React from 'react';
import type { Metadata } from 'next';
import { MembershipPage } from '@/pages/MembershipPage';
import { getSiteUrl } from '@/lib/siteConfig';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Nâng Cấp Gói VIP | WaveLink Audio',
  description:
    'Mở khóa import không giới hạn audio từ YouTube, truy cập kho nội dung độc quyền và trải nghiệm nghe không quảng cáo.',
  alternates: {
    canonical: `${siteUrl}/membership`,
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: `${siteUrl}/membership`,
    title: 'Nâng Cấp Gói VIP | WaveLink Audio',
    description:
      'Mở khóa import không giới hạn audio từ YouTube, truy cập kho nội dung độc quyền và trải nghiệm nghe không quảng cáo.',
    images: [{ url: '/wavelink-icon.png', width: 512, height: 512, alt: 'WaveLink VIP' }],
  },
};

export default function MembershipRoutePage() {
  return <MembershipPage />;
}
