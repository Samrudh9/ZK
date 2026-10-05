/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Display face for headings, Inter for UI/body copy.
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Clinical base: deep navy / slate, not the old cyan-purple neon.
        canvas: '#0A1220',
        surface: {
          DEFAULT: '#111B2D',
          raised: '#16223A',
          sunken: '#0D1727',
        },
        hairline: {
          DEFAULT: '#22304A',
          strong: '#2E3F5E',
        },
        ink: {
          DEFAULT: '#E8EEF7',
          muted: '#94A6C0',
          faint: '#64748B',
        },
        // Single trustworthy medical accent (teal), used sparingly.
        accent: {
          50: '#EAFBF7',
          100: '#CDF3EA',
          200: '#9BE6D7',
          300: '#63D2BF',
          400: '#35B8A5',
          500: '#1B9C8A',
          600: '#137D70',
          700: '#12645B',
          800: '#124F49',
          900: '#123F3B',
        },
        // Semantic status colors for clinical/permission states.
        success: { DEFAULT: '#159F7C', soft: '#0E2A25', line: '#1D4A40' },
        danger: { DEFAULT: '#DC4B4B', soft: '#2B1417', line: '#55242A' },
        warning: { DEFAULT: '#C98A16', soft: '#2A1F0C', line: '#4A3814' },
        info: { DEFAULT: '#3B82C4', soft: '#101E2E', line: '#1E3A57' },
      },
      spacing: {
        // Explicit scale so rhythm is consistent across pages.
        'section': '4rem',
        'gutter': '1.5rem',
        'stack': '0.75rem',
      },
      borderRadius: {
        card: '0.75rem',
        control: '0.5rem',
      },
      boxShadow: {
        surface: '0 1px 2px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.20)',
        raised: '0 4px 12px rgba(0,0,0,0.34)',
        focus: '0 0 0 3px rgba(27,156,138,0.28)',
      },
      transitionDuration: {
        150: '150ms',
      },
      keyframes: {
        // Subtle, functional motion only (no template glow/pulse tells).
        'enter': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        enter: 'enter 160ms ease-out',
        spin: 'spin 700ms linear infinite',
      },
    },
  },
  plugins: [],
}
