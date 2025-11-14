import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ed4545',
          600: '#dc2626',
          700: '#b91c1c',
        },
        background: {
          dark: '#262525',
          darker: '#1f1c1c',
        },
      },
    },
  },
  plugins: [],
}
export default config
