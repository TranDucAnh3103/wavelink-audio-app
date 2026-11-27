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

async function fetchPublicAudioIds() {
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
      .map((item) => item?.id)
      .filter((id) => id !== undefined && id !== null && String(id).trim() !== '')
      .map((id) => String(id));
  } catch {
    return [];
  }
}

function buildSitemapXml(audioIds) {
  const today = new Date().toISOString().split('T')[0];
  const staticEntries = STATIC_ROUTES.map(
    ({ path, changefreq, priority }) => `  <url>
    <loc>${SITE_ORIGIN}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  );

  const audioEntries = audioIds.map(
    (id) => `  <url>
    <loc>${SITE_ORIGIN}/player/${encodeURIComponent(id)}</loc>
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

const audioIds = await fetchPublicAudioIds();
writeFileSync(OUTPUT_PATH, buildSitemapXml(audioIds), 'utf8');
console.log(`[generate-sitemap] Wrote sitemap.xml with ${STATIC_ROUTES.length + audioIds.length} URLs.`);
