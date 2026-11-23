import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // RGB-триплеты нужны, чтобы работали модификаторы прозрачности
        // (bg-tg-bg/80 и т. п.). Значения выставляются из themeParams.
        tg: {
          bg: 'rgb(var(--tg-bg-rgb) / <alpha-value>)',
          'secondary-bg': 'rgb(var(--tg-secondary-bg-rgb) / <alpha-value>)',
          text: 'rgb(var(--tg-text-rgb) / <alpha-value>)',
          hint: 'rgb(var(--tg-hint-rgb) / <alpha-value>)',
          link: 'rgb(var(--tg-link-rgb) / <alpha-value>)',
          button: 'rgb(var(--tg-button-rgb) / <alpha-value>)',
          'button-text': 'rgb(var(--tg-button-text-rgb) / <alpha-value>)',
          destructive: 'rgb(var(--tg-destructive-rgb) / <alpha-value>)',
          'section-bg': 'rgb(var(--tg-section-bg-rgb) / <alpha-value>)',
          'header-bg': 'rgb(var(--tg-header-bg-rgb) / <alpha-value>)',
          'section-header':
            'rgb(var(--tg-section-header-rgb) / <alpha-value>)',
          subtitle: 'rgb(var(--tg-subtitle-rgb) / <alpha-value>)',
        },
        brand: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          orange: '#fb923c',
          amber: '#f59e0b',
          cream: '#fff7ed',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        '4xl': '1.75rem',
        '5xl': '2.25rem',
      },
      boxShadow: {
        soft: '0 10px 30px -18px rgba(15, 23, 42, 0.35)',
        card: '0 24px 60px -28px rgba(15, 23, 42, 0.55)',
        glow: '0 18px 50px -22px rgba(244, 63, 94, 0.55)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'pulse-soft': 'pulseSoft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
