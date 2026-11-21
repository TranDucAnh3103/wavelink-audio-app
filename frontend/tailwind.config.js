/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'comic-bg': 'var(--surface-bg)',
        'comic-card': 'var(--surface-card)',
        'comic-elevated': 'var(--surface-elevated)',
        'comic-muted': 'var(--surface-muted)',
        'comic-ink': 'var(--ink-primary)',
        'comic-subink': 'var(--ink-secondary)',
        'comic-border': 'var(--border-ink)',
        'comic-yellow': '#FFE600',
        'comic-blue': '#3A86FF',
        'comic-teal': '#2A9D8F',
        'comic-red': '#E63946',
        'comic-orange': '#F4A261',
        'comic-purple': '#8338EC',
      },
      fontFamily: {
        sans: ['var(--font-sans, "Nunito")', '"Nunito"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        comic: ['var(--font-comic, "Baloo 2")', '"Baloo 2"', '"Nunito"', 'sans-serif'],
        mono: ['var(--font-mono, "JetBrains Mono")', '"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
