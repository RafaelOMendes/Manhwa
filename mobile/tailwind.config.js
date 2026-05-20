/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/app/**/*.{js,jsx,ts,tsx}", "./src/components/**/*.{js,jsx,ts,tsx}"],
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
