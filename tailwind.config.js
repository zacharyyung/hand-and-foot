/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#1a5c3a',
          dark: '#134a2e',
          light: '#227a4d',
        },
      },
    },
  },
  plugins: [],
}
