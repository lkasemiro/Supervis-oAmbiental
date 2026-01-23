// tailwind.config.js
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    // Adicione seus arquivos HTML/JS/etc aqui, por exemplo:
    "./src/**/*.{html,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Define 'sans' como Lucida Sans, com fontes de sistema como fallback
        'sans': ['"Lucida Sans"', 'Verdana', 'Arial', 'Helvetica', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}