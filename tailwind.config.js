/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'draft-primary': '#1e40af',
        'draft-secondary': '#dc2626',
        'draft-accent': '#16a34a',
        'draft-warning': '#f59e0b',
        'draft-dark': '#1f2937',
        // Dark mode specific colors
        'dark-bg': '#0f172a',
        'dark-bg-secondary': '#1e293b',
        'dark-bg-tertiary': '#334155',
        'dark-border': '#475569',
        'dark-text': '#e2e8f0',
        'dark-text-secondary': '#cbd5e1',
        // Position Colors
        'position-qb': '#ef4444',
        'position-rb': '#10b981',
        'position-wr': '#3b82f6',
        'position-te': '#f59e0b',
        'position-k': '#8b5cf6',
        'position-dst': '#6b7280',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}