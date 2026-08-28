/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        eink: {
          bg: 'var(--eink-bg)',
          surface: 'var(--eink-surface)',
          surfaceHover: 'var(--eink-surface-hover)',
          text: 'var(--eink-text)',
          textSecondary: 'var(--eink-text-secondary)',
          textMuted: 'var(--eink-text-muted)',
          border: 'var(--eink-border)',
          borderDark: 'var(--eink-border-dark)',
          darkSurface: 'var(--eink-dark-surface)',
          darkText: 'var(--eink-dark-text)',
          accent: 'var(--eink-accent)',
        }
      },
      fontFamily: {
        island: ['Brashkick', 'IBM Plex Mono', 'monospace'],
        sans: ['Geist', 'Inter', 'IBM Plex Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        serif: ['Instrument Serif', 'Newsreader', 'Georgia', 'serif'],
      },
      boxShadow: {
        'eink-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'eink-md': '0 2px 4px 0 rgba(0, 0, 0, 0.08)',
        'eink-card': '0 1px 3px 0 rgba(0, 0, 0, 0.06)',
      },
      animation: {
        'eink-refresh': 'einkRefresh 0.35s ease-out forwards',
        'eink-flash': 'einkFlash 0.25s ease-in-out',
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'shake': 'shake 0.3s ease-in-out',
      },
      keyframes: {
        einkRefresh: {
          '0%': { filter: 'invert(1) contrast(200%)', opacity: '0.85' },
          '40%': { filter: 'invert(0.5) contrast(150%)', opacity: '0.9' },
          '100%': { filter: 'none', opacity: '1' },
        },
        einkFlash: {
          '0%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
          '100%': { opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' },
        }
      }
    },
  },
  plugins: [],
}
