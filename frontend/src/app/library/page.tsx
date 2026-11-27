import React from 'react';
import type { Metadata } from 'next';
import { LibraryPage } from '@/pages/LibraryPage';
import { getSiteUrl } from '@/lib/siteConfig';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Thư Viện Audio | WaveLink',
  description:
    'Tìm kiếm, lọc và phân loại hàng ngàn audio, podcast từ YouTube theo thể loại, từ khóa, tác giả.',
  alternates: {
    canonical: `${siteUrl}/library`,
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: `${siteUrl}/library`,
    title: 'Thư Viện Audio | WaveLink',
    description:
      'Tìm kiếm, lọc và phân loại hàng ngàn audio, podcast từ YouTube theo thể loại, từ khóa, tác giả.',
    images: [{ url: '/wavelink-icon.png', width: 512, height: 512, alt: 'WaveLink Library' }],
  },
};

export default function LibraryRoutePage() {
  return <LibraryPage />;
}
