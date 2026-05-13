import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './types/**/*.{ts,tsx}'
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          soft: 'rgb(var(--surface-soft) / <alpha-value>)',
          strong: 'rgb(var(--surface-strong) / <alpha-value>)',
          inverse: 'rgb(var(--surface-inverse) / <alpha-value>)'
        },
        ink: {
          DEFAULT: 'rgb(var(--text) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          subtle: 'rgb(var(--text-subtle) / <alpha-value>)'
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          strong: 'rgb(var(--primary-strong) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)'
        },
        outline: 'rgb(var(--border) / <alpha-value>)',
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626'
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '"Noto Sans SC"',
          '"PingFang SC"',
          '"HarmonyOS Sans"',
          '"Microsoft YaHei"',
          ...defaultTheme.fontFamily.sans
        ],
        mono: ['"Fira Code"', ...defaultTheme.fontFamily.mono]
      },
      boxShadow: {
        card: '0 12px 28px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};
