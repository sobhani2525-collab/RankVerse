import type { Config } from "tailwindcss";

// Constellation theme tokens for RankVerse.
// Existing tokens (bg, ink, muted, surface, border, gold, teal) kept;
// `violet` added as the second gradient stop, plus font families.
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0e1a",
        surface: {
          DEFAULT: "#121729",
          2: "#171d33",
        },
        border: {
          DEFAULT: "#232b45",
          soft: "#1b2138",
        },
        ink: {
          DEFAULT: "#eef1fb",
          dim: "#c7cce0",
        },
        muted: "#7d86a3",
        violet: {
          DEFAULT: "#8b6ef2",
          soft: "#a78bfa",
        },
        teal: "#2dd4bf",
        gold: "#f2b84b",
      },
      fontFamily: {
        sans: ["var(--font-vazirmatn)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        // Display face for headings only — Lalezar is a single-weight,
        // decorative face; don't use it for body copy or long labels.
        display: ["var(--font-lalezar)", "var(--font-vazirmatn)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "constellation-gradient": "linear-gradient(135deg, #8b6ef2 0%, #2dd4bf 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
