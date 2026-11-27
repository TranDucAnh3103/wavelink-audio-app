import React from 'react';
import type { Metadata } from 'next';
import { CommunityPage } from '@/pages/CommunityPage';
import { getSiteUrl } from '@/lib/siteConfig';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Cộng Đồng Thính Giả | WaveLink',
  description:
    'Thảo luận, chia sẻ cảm nghĩ về các audio, podcast và bảng xếp hạng thính giả tích cực tại WaveLink.',
  alternates: {
    canonical: `${siteUrl}/community`,
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: `${siteUrl}/community`,
    title: 'Cộng Đồng Thính Giả | WaveLink',
    description:
      'Thảo luận, chia sẻ cảm nghĩ về các audio, podcast và bảng xếp hạng thính giả tích cực tại WaveLink.',
    images: [{ url: '/wavelink-icon.png', width: 512, height: 512, alt: 'WaveLink Community' }],
  },
};

export default function CommunityRoutePage() {
  return <CommunityPage />;
}
