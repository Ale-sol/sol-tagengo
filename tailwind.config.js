/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#141414',
        border: '#252525',
        accent: '#f59e0b',
        'accent-dim': '#92400e',
        'word-new': 'rgba(34, 197, 94, 0.15)',
        'word-new-text': '#4ade80',
        'word-learning': 'rgba(234, 179, 8, 0.15)',
        'word-learning-text': '#fbbf24',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fadeIn 0.2s ease',
      },
      keyframes: {
        slideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
}
