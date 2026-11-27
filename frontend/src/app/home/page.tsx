import React from 'react';
import type { Metadata } from 'next';
import { HomePage } from '@/pages/HomePage';
import { getSiteUrl } from '@/lib/siteConfig';
import { fetchServerHomeData } from '@/lib/serverAudio';

const siteUrl = getSiteUrl();

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Trang Chủ | WaveLink Audio',
  description:
    'Khám phá kho audio, sách nói, podcast, talkshow tổng hợp từ video YouTube phong phú trên WaveLink.',
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: `${siteUrl}/home`,
    title: 'Trang Chủ | WaveLink Audio',
    description:
      'Khám phá kho audio, sách nói, podcast, talkshow tổng hợp từ video YouTube phong phú trên WaveLink.',
    images: [{ url: '/wavelink-icon.png', width: 512, height: 512, alt: 'WaveLink Audio' }],
  },
};

export default async function HomeRoutePage() {
  const homeData = await fetchServerHomeData();
  return (
    <HomePage
      initialAudios={homeData.audios}
      initialCatalogAudios={homeData.catalogAudios}
      initialCategories={homeData.categories}
      initialStats={homeData.stats}
    />
  );
}
