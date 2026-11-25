import { AudioItem } from '@/types';
import { extractSeriesBaseTitle } from '@/lib/seriesGrouping';

export type RelatedFilterMode = 'all' | 'category' | 'tag' | 'author' | 'title';
export type RelatedReason = 'title' | 'author' | 'tag' | 'category';

export interface RelatedAudioMatch {
  audio: AudioItem;
  score: number;
  reasons: RelatedReason[];
  primaryLabel: string;
}

const GENERIC_AUTHORS = new Set(['chưa rõ', 'official', 'youtube creator', 'unknown']);

const TITLE_STOPWORDS = new Set([
  'full',
  'bộ',
  'truyện',
  'audio',
  'tập',
  'phần',
  'chương',
  'nghe',
  'hay',
  'mới',
  'của',
  'và',
  'là',
  'trong',
  'với',
  'cho',
  'đến',
  'từ',
  'một',
  'những',
  'các',
  'khi',
  'được',
  'không',
  'người',
  'này',
  'kia',
]);

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNormalizedTags(audio: AudioItem): string[] {
  const rawTags = Array.isArray(audio.tags) ? audio.tags : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of rawTags) {
    const raw =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object' && 'name' in item
          ? String((item as { name?: unknown }).name ?? '')
          : '';
    const cleaned = normalizeText(raw.replace(/^#/, ''));
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }

  return result;
}

function extractMeaningfulTokens(title: string): Set<string> {
  const normalized = normalizeText(extractSeriesBaseTitle(title) || title);
  const tokens = new Set<string>();
  for (const word of normalized.split(' ')) {
    if (word.length < 2 || TITLE_STOPWORDS.has(word)) continue;
    tokens.add(word);
  }
  return tokens;
}

function normalizeAuthor(audio: AudioItem): string {
  const raw = normalizeText(audio.author || audio.channel || '');
  if (!raw || GENERIC_AUTHORS.has(raw)) return '';
  return raw;
}

function normalizeCategoryName(audio: AudioItem): string {
  const raw = normalizeText(audio.categoryName || '');
  if (!raw || raw === 'chung') return '';
  return raw;
}

/**
 * Computes scored related audios for `currentAudio` across title, author, tags, and category.
 */
export function getRelatedAudios(
  currentAudio: AudioItem,
  allAudios: AudioItem[]
): RelatedAudioMatch[] {
  if (!currentAudio || !Array.isArray(allAudios) || allAudios.length === 0) {
    return [];
  }

  const currentId = String(currentAudio.id);
  const currentBaseTitle = normalizeText(extractSeriesBaseTitle(currentAudio.title));
  const currentTitleTokens = extractMeaningfulTokens(currentAudio.title);
  const currentAuthor = normalizeAuthor(currentAudio);
  const currentTags = new Set(extractNormalizedTags(currentAudio));
  const currentCategoryId =
    currentAudio.categoryId && Number(currentAudio.categoryId) > 0
      ? Number(currentAudio.categoryId)
      : 0;
  const currentCategoryName = normalizeCategoryName(currentAudio);

  const seenIds = new Set<string>();
  const matches: RelatedAudioMatch[] = [];

  for (const candidate of allAudios) {
    if (!candidate) continue;
    const candidateId = String(candidate.id);
    if (candidateId === currentId || seenIds.has(candidateId)) continue;
    seenIds.add(candidateId);

    let score = 0;
    const reasons: RelatedReason[] = [];
    let isExactSeriesMatch = false;

    // 1. Title similarity
    const candidateBaseTitle = normalizeText(extractSeriesBaseTitle(candidate.title));
    if (currentBaseTitle && candidateBaseTitle) {
      if (currentBaseTitle === candidateBaseTitle) {
        score += 100;
        isExactSeriesMatch = true;
        reasons.push('title');
      } else {
        const shorterLen = Math.min(currentBaseTitle.length, candidateBaseTitle.length);
        if (
          shorterLen >= 6 &&
          (currentBaseTitle.includes(candidateBaseTitle) ||
            candidateBaseTitle.includes(currentBaseTitle))
        ) {
          score += 60;
          reasons.push('title');
        } else if (currentTitleTokens.size > 0) {
          const candidateTokens = extractMeaningfulTokens(candidate.title);
          let sharedCount = 0;
          for (const token of candidateTokens) {
            if (currentTitleTokens.has(token)) sharedCount += 1;
          }
          if (sharedCount >= 2) {
            score += Math.min(45, sharedCount * 15);
            reasons.push('title');
          }
        }
      }
    }

    // 2. Author / Channel similarity
    const candidateAuthor = normalizeAuthor(candidate);
    if (currentAuthor && candidateAuthor) {
      if (currentAuthor === candidateAuthor) {
        score += 40;
        reasons.push('author');
      } else {
        const shorterAuthorLen = Math.min(currentAuthor.length, candidateAuthor.length);
        if (
          shorterAuthorLen >= 4 &&
          (currentAuthor.includes(candidateAuthor) || candidateAuthor.includes(currentAuthor))
        ) {
          score += 20;
          reasons.push('author');
        }
      }
    }

    // 3. Tag overlap
    if (currentTags.size > 0) {
      const candidateTags = extractNormalizedTags(candidate);
      let tagOverlap = 0;
      for (const tag of candidateTags) {
        if (currentTags.has(tag)) tagOverlap += 1;
      }
      if (tagOverlap > 0) {
        score += Math.min(75, tagOverlap * 25);
        reasons.push('tag');
      }
    }

    // 4. Category match
    const candidateCategoryId =
      candidate.categoryId && Number(candidate.categoryId) > 0
        ? Number(candidate.categoryId)
        : 0;
    const candidateCategoryName = normalizeCategoryName(candidate);
    if (
      (currentCategoryId > 0 && candidateCategoryId === currentCategoryId) ||
      (currentCategoryName && candidateCategoryName === currentCategoryName)
    ) {
      score += 30;
      reasons.push('category');
    }

    if (score <= 0 || reasons.length === 0) continue;

    let primaryLabel = 'Liên quan';
    if (isExactSeriesMatch) {
      primaryLabel = 'Cùng bộ';
    } else if (reasons.includes('author')) {
      primaryLabel = 'Cùng tác giả';
    } else if (reasons.includes('tag')) {
      primaryLabel = 'Cùng thẻ';
    } else if (reasons.includes('title')) {
      primaryLabel = 'Cùng tên';
    } else if (reasons.includes('category')) {
      primaryLabel = 'Cùng thể loại';
    }

    matches.push({
      audio: candidate,
      score,
      reasons,
      primaryLabel,
    });
  }

  return matches.sort(
    (a, b) =>
      b.score - a.score ||
      (b.audio.viewCount || 0) - (a.audio.viewCount || 0) ||
      Number(b.audio.id) - Number(a.audio.id)
  );
}

/**
 * Filters scored related matches by selected filter mode.
 */
export function filterRelatedAudios(
  matches: RelatedAudioMatch[],
  mode: RelatedFilterMode
): RelatedAudioMatch[] {
  if (mode === 'all') return matches;
  return matches.filter((m) => m.reasons.includes(mode));
}
