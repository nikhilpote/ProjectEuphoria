/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        euphoria: {
          purple: '#7C3AED',
          pink: '#EC4899',
          dark: '#0F0F1A',
          card: '#1A1A2E',
          border: '#2A2A4A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
