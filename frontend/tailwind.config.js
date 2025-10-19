/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
      "./*.html",         // Scan HTML files in the frontend root
      "./blog/*.html",     // Scan HTML files in the blog subfolder
      "./scripts/**/*.js" // Scan JS files in the scripts subfolder (and its subfolders)
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}