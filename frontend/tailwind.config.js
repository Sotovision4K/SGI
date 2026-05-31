/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0A2540',
        accent: '#0066CC',
        'accent-light': '#E8F1FB',
        'text-main': '#1A1F36',
        'text-muted': '#5A6478',
        'bg-soft': '#F7F9FC',
        border: '#E3E8EF',
        success: '#00875A',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
      boxShadow: {
        'sm': '0 1px 3px rgba(10, 37, 64, 0.06)',
        'md': '0 4px 12px rgba(10, 37, 64, 0.08)',
      },
    },
  },
  plugins: [],
}