/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: 'var(--felt)',
          dark: 'var(--felt-dark)',
          mid: 'var(--felt-mid)',
          light: 'var(--felt-light)',
          deep: 'var(--felt-deep)',
        },
        wood: {
          DEFAULT: 'var(--wood)',
          light: 'var(--wood-light)',
          dark: 'var(--wood-dark)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)',
        },
        cream: {
          DEFAULT: 'var(--cream)',
          warm: 'var(--cream-warm)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          deep: 'var(--accent-deep)',
        },
        wild: {
          DEFAULT: 'var(--wild)',
          soft: 'var(--wild-soft)',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.18)',
        'card-lift': '0 4px 8px rgba(0,0,0,0.16), 0 12px 24px rgba(0,0,0,0.22)',
        pile: '0 2px 6px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.2)',
        table: 'inset 0 0 80px rgba(0,0,0,0.35), 0 12px 40px rgba(0,0,0,0.45)',
        glow: '0 0 0 1px rgba(232,184,92,0.35), 0 0 20px rgba(232,184,92,0.2)',
      },
      transitionTimingFunction: {
        settle: 'cubic-bezier(0.22, 1, 0.36, 1)',
        press: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'card-lift': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-8px)' },
        },
        'soft-pulse': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(232,184,92,0)' },
          '50%': { opacity: '1', boxShadow: '0 0 0 6px rgba(232,184,92,0.12)' },
        },
        'score-pop': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)' },
        },
        'book-settle': {
          '0%': { transform: 'translateY(-6px) scale(1.02)', opacity: '0.7' },
          '70%': { transform: 'translateY(1px) scale(0.99)' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'draw-in': {
          '0%': { opacity: '0', transform: 'translateY(-10px) rotate(-3deg)' },
          '100%': { opacity: '1', transform: 'translateY(0) rotate(0)' },
        },
        'card-draw': {
          '0%': { opacity: '0.55', transform: 'translateY(-16px) scale(1.03) rotate(-5deg)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1) rotate(0)' },
        },
        'card-place': {
          '0%': { opacity: '0.7', transform: 'translateY(-12px) scale(1.04) rotate(-3deg)' },
          '55%': { opacity: '1', transform: 'translateY(2px) scale(0.985) rotate(0.5deg)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1) rotate(0)' },
        },
        'card-discard': {
          '0%': { opacity: '0.75', transform: 'translateY(-20px) scale(1.05) rotate(-7deg)' },
          '45%': { opacity: '1', transform: 'translateY(3px) scale(0.98) rotate(1deg)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1) rotate(0)' },
        },
      },
      animation: {
        'soft-pulse': 'soft-pulse 2.4s ease-in-out infinite',
        'score-pop': 'score-pop 0.35s var(--ease-settle)',
        'book-settle': 'book-settle 0.4s var(--ease-settle)',
        'fade-up': 'fade-up 0.28s var(--ease-settle)',
        'draw-in': 'draw-in 0.32s var(--ease-settle)',
        'card-draw': 'card-draw 0.32s var(--ease-settle) both',
        'card-place': 'card-place 0.38s var(--ease-settle) both',
        'card-discard': 'card-discard 0.35s var(--ease-settle) both',
      },
    },
  },
  plugins: [],
}
