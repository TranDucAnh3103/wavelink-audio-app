export function slugifyVietnamese(input?: string | null): string {
  if (!input) return '';
  return input
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

export function buildAudioSlug(
  audio: { id: number | string; title?: string | null } | number | string,
  explicitTitle?: string | null
): string {
  const id = typeof audio === 'object' && audio !== null ? audio.id : audio;
  const rawId = String(id ?? '').trim();
  if (!rawId) return '';

  const title =
    typeof audio === 'object' && audio !== null ? audio.title : explicitTitle;
  const slugPart = slugifyVietnamese(title);
  if (!slugPart) return rawId;
  return `${slugPart}-${rawId}`;
}

export function buildPlayerPath(
  audio: { id: number | string; title?: string | null } | number | string,
  options?: { title?: string | null; t?: number | string | null; query?: string }
): string {
  const slug = buildAudioSlug(audio, options?.title);
  if (options?.query) {
    const q = options.query.startsWith('?') ? options.query : `?${options.query}`;
    return `/player/${slug}${q}`;
  }
  if (options?.t !== undefined && options?.t !== null && Number(options.t) > 0) {
    return `/player/${slug}?t=${Math.floor(Number(options.t))}`;
  }
  return `/player/${slug}`;
}

export function extractAudioIdFromSlug(rawParam?: string | string[] | null): string {
  const param = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  if (!param) return '';
  const cleaned = String(param).trim();
  if (/^\d+$/.test(cleaned)) {
    return cleaned;
  }
  const trailingIdMatch = cleaned.match(/-(\d+)$/);
  if (trailingIdMatch) {
    return trailingIdMatch[1];
  }
  return cleaned;
}
