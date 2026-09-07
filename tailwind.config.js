/** @type {import('tailwindcss').Config} */
// `brand` and `gold` resolve through CSS custom properties (see themes.css) instead of fixed hex
// values, so every existing `bg-brand-300` / `text-gold-700` / etc. class across the app keeps
// working unchanged while the actual color a given shade renders as can be swapped at runtime by
// setting `data-theme` on <html> — that's the whole mechanism behind the color scheme picker.
function themeColor(name) {
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  return Object.fromEntries(shades.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));
}

export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}', './src/web/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        brand: themeColor('brand'),
        gold: themeColor('gold'),
      },
      // Motion vocabulary. `ease-standard` is the everyday curve (a decelerating ease-out — things
      // arrive gently rather than stopping dead) and `ease-spring` overshoots slightly, for
      // elements that appear rather than merely change, like a modal.
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        250: '250ms',
        400: '400ms',
      },
      borderRadius: {
        xl2: '0.875rem',
      },
      // Layered, low-opacity shadows read as depth; a single dark shadow reads as a drawn border.
      boxShadow: {
        soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 2px 8px rgb(15 23 42 / 0.04)',
        lift: '0 2px 4px rgb(15 23 42 / 0.05), 0 8px 24px rgb(15 23 42 / 0.08)',
        float: '0 8px 16px rgb(15 23 42 / 0.08), 0 24px 56px rgb(15 23 42 / 0.16)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        // Rises and settles into place, rather than snapping in at full size.
        popIn: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        // The whole-view transition when navigating between pages.
        viewIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        // Duration is set per-instance via an inline style (content length varies), this just
        // supplies the linear/infinite/name part of the CSS `animation` shorthand.
        marquee: 'marquee linear infinite',
        fadeIn: 'fadeIn 200ms cubic-bezier(0.32, 0.72, 0, 1) both',
        popIn: 'popIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        viewIn: 'viewIn 260ms cubic-bezier(0.32, 0.72, 0, 1) both',
      },
    },
  },
  plugins: [],
};
