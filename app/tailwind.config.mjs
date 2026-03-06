export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-roobert)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-roobert-mono)', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
