import React from 'react';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { fetchServerAudio } from '@/lib/serverAudio';
import { getSiteUrl } from '@/lib/siteConfig';
import { buildAudioSlug, extractAudioIdFromSlug } from '@/lib/slug';
import { PlayerClient } from './player-client';

const siteUrl = getSiteUrl();

export const revalidate = 60;

interface PageProps {
  params: {
    id: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const audioId = extractAudioIdFromSlug(params.id);
  const audio = await fetchServerAudio(audioId);

  if (!audio) {
    return {
      title: 'Đang phát Audio | WaveLink',
      description: 'Trình phát audio từ video YouTube trên WaveLink.',
    };
  }

  const canonicalSlug = buildAudioSlug(audio);
  const canonicalUrl = `${siteUrl}/player/${canonicalSlug}`;

  const youtubeThumbnailMax = audio.youtubeVideoId
    ? `https://img.youtube.com/vi/${audio.youtubeVideoId}/maxresdefault.jpg`
    : audio.thumbnailUrl || '/wavelink-icon.png';
  const youtubeThumbnailHq = audio.youtubeVideoId
    ? `https://img.youtube.com/vi/${audio.youtubeVideoId}/hqdefault.jpg`
    : audio.thumbnailUrl || '/wavelink-icon.png';

  const cleanDesc = audio.description
    ? audio.description.replace(/\s+/g, ' ').slice(0, 160).trim()
    : `Nghe trọn vẹn audio từ video YouTube "${audio.title}" của ${audio.author}.`;

  const metaTitle = `${audio.title} - ${audio.author} | Nghe Audio YouTube WaveLink`;
  const metaDescription = `${cleanDesc} - Hỗ trợ phát nhạc chạy ngầm khi tắt màn hình, hẹn giờ tắt nhạc và bình luận cùng cộng đồng tại WaveLink.`;

  return {
    title: metaTitle,
    description: metaDescription,
    keywords: [
      audio.title,
      audio.author,
      'audio youtube',
      'nghe nhạc youtube tắt màn hình',
      'phát audio youtube chạy ngầm',
      'sách nói youtube',
      'podcast youtube',
      audio.youtubeVideoId ? `youtube ${audio.youtubeVideoId}` : '',
      ...(audio.tags || []),
    ].filter(Boolean),
    authors: [{ name: audio.author }],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'music.song',
      locale: 'vi_VN',
      url: canonicalUrl,
      title: `${audio.title} - ${audio.author}`,
      description: cleanDesc,
      siteName: 'WaveLink Audio',
      images: [
        {
          url: youtubeThumbnailMax,
          width: 1280,
          height: 720,
          alt: audio.title,
        },
        {
          url: youtubeThumbnailHq,
          width: 480,
          height: 360,
          alt: audio.title,
        },
      ],
      audio: audio.youtubeVideoId ? `https://www.youtube.com/watch?v=${audio.youtubeVideoId}` : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${audio.title} - ${audio.author}`,
      description: cleanDesc,
      images: [youtubeThumbnailMax],
    },
  };
}

export default async function PlayerRoutePage({ params, searchParams }: PageProps) {
  const audioId = extractAudioIdFromSlug(params.id);
  const audio = await fetchServerAudio(audioId);

  if (audio) {
    const canonicalSlug = buildAudioSlug(audio);
    if (params.id !== canonicalSlug) {
      const qs = new URLSearchParams();
      if (searchParams) {
        for (const [key, value] of Object.entries(searchParams)) {
          if (Array.isArray(value)) {
            value.forEach((v) => qs.append(key, v));
          } else if (value !== undefined) {
            qs.set(key, value);
          }
        }
      }
      const querySuffix = qs.toString() ? `?${qs.toString()}` : '';
      permanentRedirect(`/player/${canonicalSlug}${querySuffix}`);
    }
  }

  const canonicalUrl = audio ? `${siteUrl}/player/${buildAudioSlug(audio)}` : siteUrl;

  const durationSeconds = audio?.totalDurationSeconds || 0;
  // ISO 8601 duration formatted string (PT#M#S)
  const durationISO = durationSeconds > 0
    ? `PT${Math.floor(durationSeconds / 60)}M${durationSeconds % 60}S`
    : 'PT0M0S';

  const youtubeUrl = audio?.youtubeVideoId
    ? `https://www.youtube.com/watch?v=${audio.youtubeVideoId}`
    : audio?.youtubeUrl || siteUrl;

  const thumbnailUrl = audio?.youtubeVideoId
    ? `https://img.youtube.com/vi/${audio.youtubeVideoId}/maxresdefault.jpg`
    : audio?.thumbnailUrl || `${siteUrl}/wavelink-icon.png`;

  // JSON-LD Schema.org Structured Data
  const jsonLd = audio
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'AudioObject',
            '@id': `${canonicalUrl}#audio`,
            name: audio.title,
            description: audio.description || audio.title,
            thumbnailUrl: [thumbnailUrl],
            contentUrl: youtubeUrl,
            embedUrl: audio.youtubeVideoId
              ? `https://www.youtube-nocookie.com/embed/${audio.youtubeVideoId}`
              : undefined,
            duration: durationISO,
            inLanguage: 'vi',
            isAccessibleForFree: true,
            author: {
              '@type': 'Person',
              name: audio.author,
            },
            potentialAction: {
              '@type': 'ListenAction',
              target: [canonicalUrl],
            },
          },
          {
            '@type': 'MusicRecording',
            '@id': `${canonicalUrl}#recording`,
            name: audio.title,
            duration: durationISO,
            url: canonicalUrl,
            byArtist: {
              '@type': 'MusicGroup',
              name: audio.author,
            },
          },
          {
            '@type': 'VideoObject',
            '@id': `${canonicalUrl}#youtube-video`,
            name: audio.title,
            description: audio.description || audio.title,
            thumbnailUrl: [thumbnailUrl],
            contentUrl: youtubeUrl,
            uploadDate: audio.createdAt || '2025-01-01T00:00:00Z',
            duration: durationISO,
            embedUrl: audio.youtubeVideoId
              ? `https://www.youtube-nocookie.com/embed/${audio.youtubeVideoId}`
              : undefined,
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Trang Chủ',
                item: siteUrl,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: audio.categoryName || 'Audio',
                item: `${siteUrl}/home`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: audio.title,
                item: canonicalUrl,
              },
            ],
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      {/* Interactive WaveLink Player Client Component (already SSR-renders visible H1, metadata, description, tags) */}
      <PlayerClient initialAudio={audio} />
    </>
  );
}
