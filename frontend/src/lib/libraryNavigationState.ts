const LIBRARY_RETURN_STATE_KEY = 'wavelink_library_return_state';
const RETURN_STATE_TTL_MS = 30 * 60 * 1000;

export interface LibraryReturnState {
  page: number;
  scrollY: number;
  audioId: string;
  search: string;
  categoryId: number | null;
  status: string;
  userId: string;
  savedAt: number;
}

export function saveLibraryReturnState(state: LibraryReturnState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LIBRARY_RETURN_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export function peekLibraryReturnState(): LibraryReturnState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LIBRARY_RETURN_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LibraryReturnState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > RETURN_STATE_TTL_MS) {
      window.sessionStorage.removeItem(LIBRARY_RETURN_STATE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLibraryReturnState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LIBRARY_RETURN_STATE_KEY);
  } catch {
    // ignore storage errors
  }
}
