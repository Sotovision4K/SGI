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
      keyframes: {
        'toast-in-left':   { '0%': { transform: 'translateX(-110%)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        'toast-out-left':  { '0%': { transform: 'translateX(0)', opacity: '1' },     '100%': { transform: 'translateX(-110%)', opacity: '0' } },
        'toast-in-right':  { '0%': { transform: 'translateX(110%)', opacity: '0' },  '100%': { transform: 'translateX(0)', opacity: '1' } },
        'toast-out-right': { '0%': { transform: 'translateX(0)', opacity: '1' },      '100%': { transform: 'translateX(110%)', opacity: '0' } },
        'toast-in-down':   { '0%': { transform: 'translateY(-110%)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        'toast-out-down':  { '0%': { transform: 'translateY(0)', opacity: '1' },      '100%': { transform: 'translateY(-110%)', opacity: '0' } },
        'toast-in-up':     { '0%': { transform: 'translateY(110%)', opacity: '0' },  '100%': { transform: 'translateY(0)', opacity: '1' } },
        'toast-out-up':    { '0%': { transform: 'translateY(0)', opacity: '1' },      '100%': { transform: 'translateY(110%)', opacity: '0' } },
      },
      animation: {
        'toast-in-left':   'toast-in-left 250ms cubic-bezier(0.22,1,0.36,1)',
        'toast-out-left':  'toast-out-left 200ms ease-in forwards',
        'toast-in-right':  'toast-in-right 250ms cubic-bezier(0.22,1,0.36,1)',
        'toast-out-right': 'toast-out-right 200ms ease-in forwards',
        'toast-in-down':   'toast-in-down 250ms cubic-bezier(0.22,1,0.36,1)',
        'toast-out-down':  'toast-out-down 200ms ease-in forwards',
        'toast-in-up':     'toast-in-up 250ms cubic-bezier(0.22,1,0.36,1)',
        'toast-out-up':    'toast-out-up 200ms ease-in forwards',
      },
    },
  },
  plugins: [],
}