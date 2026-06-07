/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0e1a',
          surface: '#0f1423',
          elevated: '#151b2e',
          hover: '#1c2440',
          active: '#232d4f',
        },
        brand: {
          primary: '#4f6ef7',
          'primary-light': '#7b93ff',
          'primary-dim': 'rgba(79, 110, 247, 0.12)',
          'primary-glow': 'rgba(79, 110, 247, 0.3)',
          secondary: '#6c5ce7',
          teal: '#2dd4bf',
          'teal-glow': 'rgba(45, 212, 191, 0.35)',
          amber: '#fbbf24',
          red: '#f87171',
          'red-dim': 'rgba(248, 113, 113, 0.12)',
        },
        text: {
          primary: '#f8fafc',
          secondary: '#cbd5e1',
          muted: '#94a3b8',
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Consolas', 'Menlo', 'Monaco', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      animation: {
        'border-spin': 'borderSpin 3s linear infinite',
      },
      keyframes: {
        borderSpin: {
          to: { transform: 'rotate(360deg)' },
        }
      }
    },
  },
  plugins: [],
}
