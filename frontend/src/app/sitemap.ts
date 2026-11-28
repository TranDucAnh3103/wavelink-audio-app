import { MetadataRoute } from 'next';
import { fetchServerAllAudios } from '@/lib/serverAudio';
import { getSiteUrl } from '@/lib/siteConfig';
import { buildPlayerPath } from '@/lib/slug';

const siteUrl = getSiteUrl();

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const audios = await fetchServerAllAudios();

  const audioEntries: MetadataRoute.Sitemap = audios.map((audio) => ({
    url: `${siteUrl}${buildPlayerPath(audio)}`,
    lastModified: audio.updatedAt ? new Date(audio.updatedAt) : audio.createdAt ? new Date(audio.createdAt) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.9,
  }));

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/library`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/community`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/membership`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  return [...staticEntries, ...audioEntries];
}
