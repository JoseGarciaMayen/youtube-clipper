/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#090a0f',
        surface: '#12141a',
        border: '#1f242d',
        primary: '#3b82f6', // modern crisp blue
        accent: '#60a5fa',
      }
    },
  },
  plugins: [],
}
