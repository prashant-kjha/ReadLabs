// Token colors live in CSS variables (see src/index.css). This wrapper lets
// Tailwind opacity modifiers (e.g. bg-primary/10) work with var() colors.
const withAlpha = (variable) => ({ opacityValue }) => {
  if (opacityValue === undefined) return `var(${variable})`;
  return `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Schibsted Grotesk"', "system-ui", "-apple-system", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        primary: {
          DEFAULT: withAlpha("--color-primary"),
          hover: withAlpha("--color-primary-hover"),
          light: withAlpha("--color-primary-light"),
          foreground: withAlpha("--color-primary-foreground"),
        },
        ink: withAlpha("--color-text"),
        accent: withAlpha("--color-accent"),
        success: withAlpha("--color-success"),
        warning: withAlpha("--color-warning"),
        danger: withAlpha("--color-danger"),
        surface: {
          DEFAULT: withAlpha("--color-surface"),
          raised: withAlpha("--color-surface-raised"),
        },
        muted: {
          DEFAULT: withAlpha("--color-muted"),
          foreground: withAlpha("--color-muted-foreground"),
        },
        border: {
          DEFAULT: withAlpha("--color-border"),
          strong: withAlpha("--color-border-strong"),
        },
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "14px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        print: "var(--shadow-print)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "rule-draw": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "rise-in": "rise-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "rule-draw": "rule-draw 0.8s cubic-bezier(0.22, 1, 0.36, 1) both",
        "soft-pulse": "soft-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
