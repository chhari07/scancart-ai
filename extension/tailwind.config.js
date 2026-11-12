/** @type {import('tailwindcss').Config} */
export default {
  content: ["./popup.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: { accent: '#534AB7', accent2: '#7F77DD', accentL: '#EEEDFE' },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out',
      },
      keyframes: {
        'pulse-soft': { '0%,100%': { opacity: '1' }, '50%': { opacity: '.6' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
    },
  },
  plugins: [],
}
