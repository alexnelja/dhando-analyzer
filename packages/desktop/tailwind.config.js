/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        anthropic: {
          dark: '#141413',
          light: '#faf9f5',
          orange: '#d97757',
          blue: '#6a9bcc',
          green: '#788c5d',
          gray: '#b0aea5',
        },
      },
    },
  },
  plugins: [],
};
