import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ORIGIN = 'https://wavelink-audio-app.zhost.education';
const OUTPUT_PATH = resolve(__dirname, '../public/sitemap.xml');

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/home', changefreq: 'hourly', priority: '1.0' },
  { path: '/library', changefreq: 'daily', priority: '0.9' },
  { path: '/community', changefreq: 'daily', priority: '0.7' },
  { path: '/membership', changefreq: 'weekly', priority: '0.6' },
];

function slugifyVietnamese(input) {
  if (!input) return '';
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function buildAudioSlug(item) {
  const rawId = String(item?.id ?? '').trim();
  const slugPart = slugifyVietnamese(item?.title);
  return slugPart ? `${slugPart}-${rawId}` : rawId;
}

async function fetchPublicAudioSlugs() {
  const apiBase =
    process.env.VITE_API_BASE_URL ||
    'https://wavelink-audio-app-backend-latest.onrender.com/api/v1';
  const cleanBase = apiBase.replace(/\/+$/, '');
  const endpoint = `${cleanBase}/audios?limit=200`;

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const payload = await res.json();
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.audios)
          ? payload.audios
          : [];
    return items
      .filter((item) => item?.id !== undefined && item?.id !== null && String(item.id).trim() !== '')
      .map((item) => buildAudioSlug(item));
  } catch {
    return [];
  }
}

function buildSitemapXml(audioSlugs) {
  const today = new Date().toISOString().split('T')[0];
  const staticEntries = STATIC_ROUTES.map(
    ({ path, changefreq, priority }) => `  <url>
    <loc>${SITE_ORIGIN}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  );

  const audioEntries = audioSlugs.map(
    (slug) => `  <url>
    <loc>${SITE_ORIGIN}/player/${encodeURIComponent(slug)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...audioEntries].join('\n')}
</urlset>
`;
}

const audioSlugs = await fetchPublicAudioSlugs();
writeFileSync(OUTPUT_PATH, buildSitemapXml(audioSlugs), 'utf8');
console.log(`[generate-sitemap] Wrote sitemap.xml with ${STATIC_ROUTES.length + audioSlugs.length} URLs.`);
