import type { Config } from 'tailwindcss';

// "Lager Label" palette: golden lager (Corona / Budweiser gold), bottle green (Heineken),
// label red (Budweiser), and coastal blue (Corona). The default amber/yellow/orange, green,
// red, blue and gray scales are remapped so every existing utility class picks the theme up.
const gold = {
  50: '#fffbea', 100: '#fff3c4', 200: '#ffe58a', 300: '#ffd24d', 400: '#fcc02a',
  500: '#f0a60e', 600: '#d68a06', 700: '#b06a08', 800: '#8f530d', 900: '#77450f', 950: '#452404',
};
const lager = {
  50: '#effaf3', 100: '#d6f2e1', 200: '#b0e5c7', 300: '#7dd1a6', 400: '#46b681',
  500: '#1f9a63', 600: '#0f7d4f', 700: '#0b6340', 800: '#0a4f35', 900: '#08402c', 950: '#04271b',
};
const label = {
  50: '#fff1f2', 100: '#ffe0e3', 200: '#ffc2c9', 300: '#ff94a1', 400: '#f9566b',
  500: '#e1253f', 600: '#c8102e', 700: '#a50d26', 800: '#860f25', 900: '#6f1224', 950: '#3d0510',
};
const coast = {
  50: '#eefaff', 100: '#d7f1fe', 200: '#b3e6fd', 300: '#79d5fb', 400: '#38bef4',
  500: '#1d9fd4', 600: '#1480b4', 700: '#14668f', 800: '#165576', 900: '#17475f', 950: '#0e2e40',
};
const ink = {
  50: '#f6f8f4', 100: '#ecf0e8', 200: '#dbe2d6', 300: '#c3cdbe', 400: '#98a794',
  500: '#6f8072', 600: '#54655a', 700: '#3e4e44', 800: '#263a2e', 900: '#10241b', 950: '#081410',
};

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold, lager, label, coast, ink,
        cream: '#fff8e6',
        foam: '#fffdf5',
        beer: gold,
        amber: gold, yellow: gold, orange: gold,
        green: lager, emerald: lager,
        red: label, rose: label,
        blue: coast, indigo: coast, sky: coast,
        gray: ink, slate: ink, zinc: ink, neutral: ink,
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
        body:    ['var(--font-body)', 'system-ui', 'sans-serif'],
        slab:    ['var(--font-slab)', 'Georgia', 'serif'],
      },
      boxShadow: {
        label: '0 1px 0 rgba(255,255,255,.6) inset, 0 8px 24px -8px rgba(8,64,44,.35)',
        glow:  '0 0 0 4px rgba(252,192,42,.35)',
      },
      keyframes: {
        rise: {
          '0%':   { transform: 'translateY(0) scale(.6)', opacity: '0' },
          '15%':  { opacity: '.9' },
          '100%': { transform: 'translateY(-150px) scale(1)', opacity: '0' },
        },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        rise:   'rise 3.2s ease-in infinite',
        floaty: 'floaty 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
