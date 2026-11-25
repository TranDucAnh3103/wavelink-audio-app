import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useThemeStore } from '@/stores/themeStore';
import { useDelayedFallback } from '@/hooks/useDelayedFallback';

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'dark-comic');
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to light and toggles both dark and dark-comic classes', () => {
    expect(useThemeStore.getState().theme).toBe('light');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');

    useThemeStore.getState().setTheme('dark');
    expect(localStorage.getItem('setting_theme')).toBe('dark');
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('dark-comic')).toBe(true);

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(useThemeStore.getState().resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('dark-comic')).toBe(false);
  });

  it('resolves system theme from matchMedia and reacts to system changes', () => {
    let matches = true;
    const listeners = new Set<() => void>();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        get matches() {
          return matches;
        },
        media: '(prefers-color-scheme: dark)',
        addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_event: string, cb: () => void) => listeners.delete(cb),
      })),
    });

    localStorage.setItem('setting_theme', 'system');
    const cleanup = useThemeStore.getState().initTheme();

    expect(useThemeStore.getState().theme).toBe('system');
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    matches = false;
    listeners.forEach((cb) => cb());

    expect(useThemeStore.getState().resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    cleanup();
  });
});

describe('useDelayedFallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('returns isPending immediately in test env for deterministic rendering', () => {
    const { result, rerender } = renderHook(
      ({ pending }) => useDelayedFallback(pending, 180),
      { initialProps: { pending: true } }
    );
    expect(result.current).toBe(true);

    rerender({ pending: false });
    expect(result.current).toBe(false);
  });

  it('delays fallback visibility until delayMs elapses outside test env', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ pending }) => useDelayedFallback(pending, 180),
      { initialProps: { pending: true } }
    );

    // Before 180ms: skeleton stays hidden so fast/cached loads never flash
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(179);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);

    rerender({ pending: false });
    expect(result.current).toBe(false);
  });
});
