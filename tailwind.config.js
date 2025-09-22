/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html"],
   safelist: [
    'bg-orange-600',
    'hover:bg-orange-700',
    // Puedes añadir aquí otras clases que se generen dinámicamente
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
