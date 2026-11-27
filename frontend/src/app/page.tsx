import React from 'react';
import type { Metadata } from 'next';
import { HomePage } from '@/pages/HomePage';
import { getSiteUrl } from '@/lib/siteConfig';
import { fetchServerHomeData } from '@/lib/serverAudio';

const siteUrl = getSiteUrl();

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'WaveLink - Nền Tảng Nghe Audio Từ Video YouTube Tắt Màn Hình',
  description:
    'Thưởng thức sách nói, podcast, bài giảng, âm nhạc trọn vẹn từ video YouTube mà không cần bật sáng màn hình. Tự động hẹn giờ tắt nhạc, trải nghiệm mượt mà, tiện lợi.',
  alternates: {
    canonical: siteUrl,
  },
};

export default async function RootHomePage() {
  const homeData = await fetchServerHomeData();
  const featuredItems = (homeData.catalogAudios.length > 0 ? homeData.catalogAudios : homeData.audios).slice(0, 10);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: siteUrl,
        name: 'WaveLink Audio',
        description: 'Nghe Audio Từ Video YouTube Không Bị Gián Đoạn',
        potentialAction: [
          {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${siteUrl}/library?search={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
        ],
      },
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'WaveLink Audio',
        url: siteUrl,
        logo: `${siteUrl}/wavelink-icon.png`,
      },
      ...(featuredItems.length > 0
        ? [
            {
              '@type': 'ItemList',
              name: 'Audio & Podcast Nổi Bật trên WaveLink',
              itemListElement: featuredItems.map((item, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                url: `${siteUrl}/player/${item.id}`,
                name: item.title,
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePage
        initialAudios={homeData.audios}
        initialCatalogAudios={homeData.catalogAudios}
        initialCategories={homeData.categories}
        initialStats={homeData.stats}
      />
    </>
  );
}
