/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'status-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'status-blink-urgent': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.15', transform: 'scale(1.05)' },
        },
      },
      animation: {
        'status-blink': 'status-blink 1.5s ease-in-out infinite',
        'status-blink-urgent': 'status-blink-urgent 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
