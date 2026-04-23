/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Colores basados en la web de Speedcubing Almería
        "almeria-orange": "#F39C12",
        "almeria-dark": "#2C3E50",
        "almeria-light": "#ECF0F1",
        "wca-green": "#009e60",
        "wca-red": "#d50000",
      },
      fontFamilty: {
        sans: ["Roboto", "Arial", "sans-serif"],
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        popIn: {
          "0%": { transform: "scale(0) translateY(50px)", opacity: "0" },
          "80%": { transform: "scale(1.1) translateY(-10px)", opacity: "1" },
          "100%": { transform: "scale(1) translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "slide-up": "slideUp 1s cubic-bezier(0.16, 1, 0.3, 1)",
        "pop-in": "popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275",
      },
    },
  },
  plugins: [],
};
