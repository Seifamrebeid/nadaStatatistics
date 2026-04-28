/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#2a7ae2", dark: "#1e5bb3" },
      },
    },
  },
  plugins: [],
};
