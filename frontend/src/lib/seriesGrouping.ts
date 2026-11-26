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
  /^\s*(?:\[(?:full|trọn\s*bộ|bản\s*full|audio(?:\s*truyện)?|(?:tập|chương|phần|quyển|hồi|ep(?:isode)?|part|vol(?:ume)?|p\.?)\s*[\d\s\-–~→đếnvà,./]*)\]|\((?:full|trọn\s*bộ|bản\s*full|(?:tập|chương|phần|quyển|hồi|ep(?:isode)?|part|vol(?:ume)?|p\.?)\s*[\d\s\-–~→đếnvà,./]*)\)|(?:full(?:\s*(?:truyện|bộ|audio))?(?:\s*\d+\s*(?:tập|chương|phần|quyển|hồi))?|trọn\s*bộ(?:\s*\d+\s*(?:tập|chương|phần))?|truyện\s*audio)\s*[-:|•–—]*\s*|(?:(?:tập|chương|phần|quyển|hồi|part|ep(?:isode)?|vol(?:ume)?|p)\s*\.?\s*\d+(?:\s*[-–~→đếnvà,./]+\s*\d+)*(?:\s*(?:cuối|end|hết|full))?\s*[-:|•–—]*))\s*[-:|•–—]*\s*/iu;

const BRACKETED_PART_RE =
  /\s*[\[(]\s*(?:tập|phần|chương|quyển|hồi|part|ep(?:isode)?|vol(?:ume)?|p\.?|full|trọn\s*bộ|bản\s*full|#)\s*\.?\s*[\d\s\-–~→đếnvà,./]*(?:cuối|end|hết|mới)?\s*[\])]\s*$/iu;

const SEPARATOR_PART_RE =
  /\s*[-|–—:/•]+\s*(?:(?:tập|phần|chương|quyển|hồi|part|ep(?:isode)?|vol(?:ume)?|p)\s*\.?\s*(?:\d+(?:\s*[-–~→đếnvà,./]+\s*\d+)*|cuối|end|hết|mới)|full(?:\s*\d+\s*(?:tập|chương|phần))?|trọn\s*bộ(?:\s*\d+\s*tập)?|#\d+|\d+\s*\/\s*\d+)\s*$/iu;

const TRAILING_BARE_PART_RE =
  /\s+(?:(?:tập|phần|chương|quyển|hồi|part|ep(?:isode)?|vol(?:ume)?)\s*\.?\s*(?:\d+(?:\s*[-–~→đếnvà,./]+\s*\d+)*|cuối|end|hết)|p\.?\s*\d+|#\d+|\d+\s*\/\s*\d+)\s*$/iu;

const INLINE_SEGMENT_PART_RE =
  /\s*[-|–—:/•]+\s*(?:tập|phần|chương|quyển|hồi|part|ep(?:isode)?|vol(?:ume)?)\s*\.?\s*\d+(?:\s*[-–~→đếnvà,./]+\s*\d+)*(?=\s*[|\-–—:/•(\[])/iu;

const BOILERPLATE_WORDS = new Set([
  'full',
  'tron',
  'trọn',
  'bo',
  'bộ',
  'truyen',
  'truyện',
  'audio',
  'tap',
  'tập',
  'phan',
  'phần',
  'chuong',
  'chương',
  'quyen',
  'quyển',
  'hoi',
  'hồi',
  'part',
  'ep',
  'episode',
  'vol',
  'volume',
  'review',
  'tom',
  'tóm',
  'tat',
  'tắt',
  'p',
  'va',
  'và',
  'den',
  'đến',
  'tapcuoi',
  'cuoi',
  'cuối',
  'end',
  'het',
  'hết',
  'moi',
  'mới',
]);

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
    clean = clean.replace(/^[\s\-|–—:/•,]+/g, '').trim();
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

function normalizeAuthorKey(audio: AudioItem): string {
  const raw = (audio.author || audio.channel || '').normalize('NFC').toLowerCase().trim();
  return raw.replace(/\s+/g, ' ');
}

function extractMeaningfulTokens(phrase: string): string[] {
  const normalized = normalizeSeriesKey(phrase);
  if (!normalized) return [];
  return normalized.split(' ').filter((w) => w.length > 0 && !/^\d+$/.test(w) && !BOILERPLATE_WORDS.has(w));
}

/**
 * Counts meaningful Unicode alphanumeric characters after excluding generic boilerplate tokens & numbers.
 */
export function countMeaningfulChars(phrase: string): number {
  return extractMeaningfulTokens(phrase).join('').length;
}

function splitCleanWords(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/**
 * Finds the longest contiguous sequence of matching words anywhere across two cleaned titles.
 */
function findLongestCommonWordPhrase(titleA: string, titleB: string): string {
  const wordsA = splitCleanWords(titleA);
  const wordsB = splitCleanWords(titleB);
  if (wordsA.length === 0 || wordsB.length === 0) return '';

  const lowerA = wordsA.map((w) => w.toLowerCase());
  const lowerB = wordsB.map((w) => w.toLowerCase());

  let bestLen = 0;
  let bestEndIdx = 0;
  const prevRow = new Array<number>(wordsB.length + 1).fill(0);

  for (let i = 1; i <= lowerA.length; i++) {
    for (let j = lowerB.length; j >= 1; j--) {
      if (lowerA[i - 1] === lowerB[j - 1]) {
        const len = prevRow[j - 1] + 1;
        prevRow[j] = len;
        if (len > bestLen) {
          bestLen = len;
          bestEndIdx = i;
        }
      } else {
        prevRow[j] = 0;
      }
    }
  }

  if (bestLen === 0) return '';
  return wordsA
    .slice(bestEndIdx - bestLen, bestEndIdx)
    .join(' ')
    .replace(/[\s\-|–—:/•,(\[]+$/g, '')
    .trim();
}

function computeSharedGroupTitle(items: AudioItem[]): string {
  if (items.length === 0) return '';
  const bases = items.map((a) => extractSeriesBaseTitle(a.title));
  let shared = bases[0];
  for (let i = 1; i < bases.length; i++) {
    const common = findLongestCommonWordPhrase(shared, bases[i]);
    if (countMeaningfulChars(common) > 10) {
      shared = common;
    }
  }
  const cleaned = extractSeriesBaseTitle(shared) || shared;
  if (countMeaningfulChars(cleaned) > 10) {
    return cleaned;
  }
  return [...bases].sort((a, b) => a.length - b.length)[0] || items[0].title;
}

function computeVerifiedSearchQuery(baseTitle: string, items: AudioItem[]): string {
  const candidate = baseTitle.trim();
  if (
    countMeaningfulChars(candidate) > 10 &&
    items.every((a) => a.title.toLowerCase().includes(candidate.toLowerCase()))
  ) {
    return candidate;
  }

  let shared = extractSeriesBaseTitle(items[0]?.title || candidate);
  for (let i = 1; i < items.length; i++) {
    const common = findLongestCommonWordPhrase(shared, items[i].title);
    if (common) shared = common;
  }
  if (
    countMeaningfulChars(shared) > 10 &&
    items.every((a) => a.title.toLowerCase().includes(shared.toLowerCase()))
  ) {
    return shared;
  }

  // Shortest shared contiguous word slice still present in every member's title
  const words = splitCleanWords(candidate);
  for (let len = words.length; len >= 2; len--) {
    const slice = words.slice(0, len).join(' ').replace(/[\s\-|–—:/•,]+$/g, '');
    if (
      slice.length >= 6 &&
      items.every((a) => a.title.toLowerCase().includes(slice.toLowerCase()))
    ) {
      return slice;
    }
  }

  return candidate || items[0]?.title || '';
}

function sortItemsInSeriesOrder(items: AudioItem[]): AudioItem[] {
  const getPartHint = (title: string): number | null => {
    const m = title.match(/(?:tập|chương|phần|quyển|hồi|part|p\.?|ep(?:isode)?|#)\s*(\d+)/iu);
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
 * Automatically groups multi-part audiobook uploads that belong to the same author
 * and share a meaningful title phrase (>10 non-boilerplate characters) into Series collections.
 */
export function groupAudiosIntoSeries(audios: AudioItem[]): SeriesGroup[] {
  if (!audios || audios.length < 2) return [];

  // Bucket by normalized author first: series parts MUST share the same author/channel
  const byAuthor = new Map<string, AudioItem[]>();
  for (const audio of audios) {
    if (!audio?.title) continue;
    const authorKey = normalizeAuthorKey(audio);
    if (!authorKey) continue;
    const list = byAuthor.get(authorKey);
    if (list) list.push(audio);
    else byAuthor.set(authorKey, [audio]);
  }

  const multiPartGroups: Array<{ key: string; displayTitle: string; items: AudioItem[] }> = [];

  for (const [authorKey, authorItems] of byAuthor.entries()) {
    if (authorItems.length < 2) continue;

    const n = authorItems.length;
    const bases = authorItems.map((a) => extractSeriesBaseTitle(a.title));
    const normKeys = bases.map((b) => normalizeSeriesKey(b));
    const meaningfulCharCounts = bases.map((b) => countMeaningfulChars(b));

    const parent = Array.from({ length: n }, (_, idx) => idx);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const unite = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    for (let i = 0; i < n; i++) {
      if (meaningfulCharCounts[i] <= 10) continue;
      for (let j = i + 1; j < n; j++) {
        if (meaningfulCharCounts[j] <= 10) continue;

        if (normKeys[i] && normKeys[i] === normKeys[j]) {
          unite(i, j);
          continue;
        }

        const commonPhrase = findLongestCommonWordPhrase(bases[i], bases[j]);
        const meaningfulTokens = extractMeaningfulTokens(commonPhrase);
        if (meaningfulTokens.length >= 2 && meaningfulTokens.join('').length > 10) {
          unite(i, j);
        }
      }
    }

    const clusters = new Map<number, AudioItem[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      const bucket = clusters.get(root);
      if (bucket) bucket.push(authorItems[i]);
      else clusters.set(root, [authorItems[i]]);
    }

    for (const clusterItems of clusters.values()) {
      if (clusterItems.length < 2) continue;
      const displayTitle = computeSharedGroupTitle(clusterItems);
      if (countMeaningfulChars(displayTitle) <= 10) continue;
      multiPartGroups.push({
        key: `${authorKey}::${normalizeSeriesKey(displayTitle)}`,
        displayTitle,
        items: clusterItems,
      });
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
 * Computes top authors / YouTube channels with aggregated series count and episodes.
 */
export function groupTopAuthors(audios: AudioItem[], limit = 15): AuthorHighlight[] {
  const map = new Map<string, AuthorHighlight>();
  for (const a of audios) {
    const rawName = (a.author || a.channel || '').trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();
    const eps = a.totalEpisodes || a.episodes?.length || 1;
    const views = a.viewCount || 0;
    const existing = map.get(key);
    if (existing) {
      existing.audioCount += 1;
      existing.totalEpisodes += eps;
      existing.totalViews += views;
      if (!existing.sampleThumbnail && a.thumbnailUrl) {
        existing.sampleThumbnail = a.thumbnailUrl;
      }
    } else {
      map.set(key, {
        name: rawName,
        audioCount: 1,
        totalEpisodes: eps,
        totalViews: views,
        sampleThumbnail: a.thumbnailUrl || '/wavelink-icon.png',
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.audioCount - a.audioCount || b.totalViews - a.totalViews)
    .slice(0, limit);
}
