import { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/siteConfig';

const siteUrl = getSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/home', '/library', '/player/', '/community', '/membership', '/profile/'],
      disallow: ['/api/', '/admin/', '/settings', '/notifications', '/upload', '/login', '/register'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
