/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6f3",
          100: "#d7e9e2",
          200: "#b0d3c5",
          300: "#84b8a5",
          400: "#5a9b85",
          500: "#3d7d68",
          600: "#2f6353",
          700: "#274f44",
          800: "#213f37",
          900: "#1a332d",
        },
        ink: {
          50: "#f6f7f8",
          100: "#eceef0",
          200: "#d5d9dd",
          300: "#b1b8bf",
          400: "#89939d",
          500: "#6b7580",
          600: "#555e68",
          700: "#454b54",
          800: "#2f3439",
          900: "#1c1f22",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
