import { AudioItem } from '@/types';

export interface SeriesGroup {
  key: string;
  seriesTitle: string;
  searchQuery: string;
  items: AudioItem[];
  partCount: number;
  totalEpisodes: number;
  totalDurationSeconds: number;
  totalViews: number;
  thumbnailUrl: string;
  author: string;
  categoryName: string;
}

export interface AuthorHighlight {
  name: string;
  audioCount: number;
  totalEpisodes: number;
  totalViews: number;
  sampleThumbnail: string;
}

const LEADING_PART_RE =
  /^\s*(?:\[(?:full|trọn\s*bộ|bản\s*full|audio(?:\s*truyện)?|tập\s*[\d\s\-–~→đếnvà,./]+|phần\s*\d+|p\.?\s*\d+)\]|\((?:full|trọn\s*bộ|bản\s*full|tập\s*[\d\s\-–~→đếnvà,./]+|phần\s*\d+|p\.?\s*\d+)\)|(?:full(?:\s*\d+\s*(?:tập|chương|phần))?|trọn\s*bộ(?:\s*\d+\s*(?:tập|chương))?))\s*[-:|•–—]*\s*/iu;

const BRACKETED_PART_RE =
  /\s*[\[(]\s*(?:tập|phần|chương|hồi|part|ep(?:isode)?|vol(?:ume)?|p\.?|full|trọn\s*bộ|bản\s*full|#)\s*\.?\s*[\d\s\-–~→đếnvà,./]*(?:cuối|end|mới)?\s*[\])]\s*$/iu;

const SEPARATOR_PART_RE =
  /\s*[-|–—:/•]+\s*(?:(?:tập|phần|chương|hồi|part|ep(?:isode)?|vol(?:ume)?|p)\s*\.?\s*(?:\d+(?:\s*[-–~→đếnvà,./]+\s*\d+)*|cuối|end|mới)|full(?:\s*\d+\s*(?:tập|chương|phần))?|trọn\s*bộ(?:\s*\d+\s*tập)?|#\d+|\d+\s*\/\s*\d+)\s*$/iu;

const TRAILING_BARE_PART_RE =
  /\s+(?:(?:tập|phần|chương|hồi|part|ep(?:isode)?|vol(?:ume)?)\s*\.?\s*(?:\d+(?:\s*[-–~→đếnvà,./]+\s*\d+)*|cuối|end)|p\.?\s*\d+|#\d+|\d+\s*\/\s*\d+)\s*$/iu;

const INLINE_SEGMENT_PART_RE =
  /\s*[-|–—:/•]+\s*(?:tập|phần|chương|hồi|part|ep(?:isode)?|vol(?:ume)?)\s*\.?\s*\d+(?:\s*[-–~→đếnvà,./]+\s*\d+)*(?=\s*[|\-–—:/•(\[])/iu;

/**
 * Strips episode/part/full markers from a story title so separate uploads of the same series match.
 */
export function extractSeriesBaseTitle(rawTitle: string): string {
  let clean = (rawTitle || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  // Strip repeated leading/trailing/mid episode or "Full" badges cleanly
  for (let i = 0; i < 4; i++) {
    const prev = clean;
    clean = clean.replace(LEADING_PART_RE, '').trim();
    clean = clean.replace(BRACKETED_PART_RE, '').trim();
    clean = clean.replace(SEPARATOR_PART_RE, '').trim();
    clean = clean.replace(TRAILING_BARE_PART_RE, '').trim();
    clean = clean.replace(INLINE_SEGMENT_PART_RE, '').trim();
    clean = clean.replace(/[\s\-|–—:/•,]+$/g, '').trim();
    if (clean === prev) break;
  }

  return clean || rawTitle.trim();
}

function normalizeSeriesKey(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findLongestCommonWordPrefix(titles: string[]): string {
  if (titles.length === 0) return '';
  const wordLists = titles.map((t) => t.replace(/\s+/g, ' ').trim().split(' '));
  const minLen = Math.min(...wordLists.map((w) => w.length));
  const common: string[] = [];

  for (let i = 0; i < minLen; i++) {
    const first = wordLists[0][i];
    if (wordLists.every((w) => w[i].toLowerCase() === first.toLowerCase())) {
      common.push(first);
    } else {
      break;
    }
  }

  return common
    .join(' ')
    .replace(/[\s\-|–—:/•,(\[]+$/g, '')
    .trim();
}

function computeVerifiedSearchQuery(baseTitle: string, items: AudioItem[]): string {
  const candidate = baseTitle.trim();
  if (
    candidate.length >= 3 &&
    items.every((a) => a.title.toLowerCase().includes(candidate.toLowerCase()))
  ) {
    return candidate;
  }

  const commonPrefix = findLongestCommonWordPrefix(items.map((a) => a.title));
  if (
    commonPrefix.length >= 3 &&
    items.every((a) => a.title.toLowerCase().includes(commonPrefix.toLowerCase()))
  ) {
    return commonPrefix;
  }

  // Shortest shared normalized words fallback
  const words = candidate.split(/\s+/).filter(Boolean);
  for (let len = words.length; len >= 2; len--) {
    const slice = words.slice(0, len).join(' ').replace(/[\s\-|–—:/•,]+$/g, '');
    if (
      slice.length >= 3 &&
      items.every((a) => a.title.toLowerCase().includes(slice.toLowerCase()))
    ) {
      return slice;
    }
  }

  return candidate || items[0]?.title || '';
}

function sortItemsInSeriesOrder(items: AudioItem[]): AudioItem[] {
  const getPartHint = (title: string): number | null => {
    const m = title.match(/(?:tập|phần|part|p\.?|ep(?:isode)?|#)\s*(\d+)/iu);
    return m ? Number(m[1]) : null;
  };
  return [...items].sort((a, b) => {
    const hintA = getPartHint(a.title);
    const hintB = getPartHint(b.title);
    if (hintA !== null && hintB !== null && hintA !== hintB) {
      return hintA - hintB;
    }
    return Number(a.id) - Number(b.id);
  });
}

/**
 * Automatically groups multi-part audiobook uploads with matching titles into clickable Series collections.
 * Only groups with at least 2 parts are returned.
 */
export function groupAudiosIntoSeries(audios: AudioItem[]): SeriesGroup[] {
  if (!audios || audios.length < 2) return [];

  const buckets = new Map<string, { displayTitle: string; items: AudioItem[] }>();

  // Pass 1: exact normalized base-title grouping
  for (const audio of audios) {
    if (!audio?.title) continue;
    const base = extractSeriesBaseTitle(audio.title);
    const key = normalizeSeriesKey(base);
    if (key.length < 4) continue;

    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(audio);
      if (base.length > 0 && base.length < existing.displayTitle.length) {
        existing.displayTitle = base;
      }
    } else {
      buckets.set(key, { displayTitle: base, items: [audio] });
    }
  }

  const singletons: AudioItem[] = [];
  const multiPartGroups: Array<{ key: string; displayTitle: string; items: AudioItem[] }> = [];

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.items.length >= 2) {
      multiPartGroups.push({ key, ...bucket });
    } else {
      singletons.push(bucket.items[0]);
    }
  }

  // Pass 2: group remaining singletons sharing a distinctive >=4-word, >=20-char prefix
  if (singletons.length >= 2) {
    const used = new Set<number | string>();
    for (let i = 0; i < singletons.length; i++) {
      const a = singletons[i];
      if (used.has(a.id)) continue;

      const matched: AudioItem[] = [a];
      let sharedPrefix = extractSeriesBaseTitle(a.title);

      for (let j = i + 1; j < singletons.length; j++) {
        const b = singletons[j];
        if (used.has(b.id)) continue;
        const prefix = findLongestCommonWordPrefix([a.title, b.title]);
        const prefixWords = prefix.split(/\s+/).filter(Boolean);
        if (prefixWords.length >= 4 && prefix.length >= 20) {
          matched.push(b);
          sharedPrefix = prefix;
        }
      }

      if (matched.length >= 2) {
        matched.forEach((m) => used.add(m.id));
        const cleanPrefix = extractSeriesBaseTitle(sharedPrefix) || sharedPrefix;
        multiPartGroups.push({
          key: `prefix:${normalizeSeriesKey(cleanPrefix)}`,
          displayTitle: cleanPrefix,
          items: matched,
        });
      }
    }
  }

  return multiPartGroups
    .map((group) => {
      const ordered = sortItemsInSeriesOrder(group.items);
      const lead = ordered[0];
      const searchQuery = computeVerifiedSearchQuery(group.displayTitle, ordered);
      return {
        key: group.key,
        seriesTitle: group.displayTitle,
        searchQuery,
        items: ordered,
        partCount: ordered.length,
        totalEpisodes: ordered.reduce(
          (sum, item) => sum + (item.totalEpisodes || item.episodes?.length || 1),
          0
        ),
        totalDurationSeconds: ordered.reduce(
          (sum, item) => sum + (item.totalDurationSeconds || 0),
          0
        ),
        totalViews: ordered.reduce((sum, item) => sum + (item.viewCount || 0), 0),
        thumbnailUrl: lead?.thumbnailUrl || '/wavelink-icon.png',
        author: lead?.author || 'Official',
        categoryName: lead?.categoryName || 'Chung',
      };
    })
    .sort((a, b) => b.partCount - a.partCount || b.totalViews - a.totalViews);
}

/**
 * Aggregates top authors/channels across the catalog for quick author discovery on HomePage.
 */
export function groupTopAuthors(audios: AudioItem[], limit: number = 6): AuthorHighlight[] {
  if (!audios || audios.length === 0) return [];

  const map = new Map<string, AuthorHighlight>();
  for (const audio of audios) {
    const rawAuthor = (audio.author || '').trim();
    if (!rawAuthor || rawAuthor.toLowerCase() === 'chưa rõ') continue;

    const key = rawAuthor.toLowerCase();
    const existing = map.get(key);
    const eps = audio.totalEpisodes || audio.episodes?.length || 1;
    const views = audio.viewCount || 0;

    if (existing) {
      existing.audioCount += 1;
      existing.totalEpisodes += eps;
      existing.totalViews += views;
    } else {
      map.set(key, {
        name: rawAuthor,
        audioCount: 1,
        totalEpisodes: eps,
        totalViews: views,
        sampleThumbnail: audio.thumbnailUrl || '/wavelink-icon.png',
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalViews - a.totalViews || b.audioCount - a.audioCount)
    .slice(0, limit);
}
