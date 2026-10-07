/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0b0f19',
        surface: '#111827',
        border: '#1f2937',
        primary: '#06b6d4',
        accent: '#f59e0b',
      }
    },
  },
  plugins: [],
}
