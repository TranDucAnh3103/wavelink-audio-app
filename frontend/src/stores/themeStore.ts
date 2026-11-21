'use client';

import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  initTheme: () => () => void;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

export function applyThemeToDocument(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark', 'dark-comic');
    } else {
      root.classList.remove('dark', 'dark-comic');
    }
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolved === 'dark' ? '#141418' : '#F6F5F0');
    }
  }
  return resolved;
}

function readStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'light';
  const stored = localStorage.getItem('setting_theme');
  if (stored === 'dark' || stored === 'light' || stored === 'system') {
    return stored;
  }
  return 'light';
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',
  resolvedTheme: 'light',

  initTheme: () => {
    const stored = readStoredTheme();
    const resolved = applyThemeToDocument(stored);
    set({ theme: stored, resolvedTheme: resolved });

    if (typeof window === 'undefined' || !window.matchMedia) {
      return () => {};
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const currentMode = get().theme;
      if (currentMode === 'system') {
        const nextResolved = applyThemeToDocument('system');
        set({ resolvedTheme: nextResolved });
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  },

  setTheme: (theme: ThemeMode) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('setting_theme', theme);
    }
    const resolved = applyThemeToDocument(theme);
    set({ theme, resolvedTheme: resolved });
  },

  toggleTheme: () => {
    const currentResolved = get().resolvedTheme;
    const next: ThemeMode = currentResolved === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));
