import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0B0F1A",
        surface: {
          DEFAULT: "#12172A",
          2: "#1A2036",
        },
        // Legacy flat alias — kept alongside surface.2 since existing
        // components already use `bg-surface2`.
        surface2: "#1A2036",
        border: {
          DEFAULT: "#232A42",
          soft: "#1b2138",
        },
        gold: {
          DEFAULT: "#E8B34A",
          dim: "#8A6B2E",
        },
        teal: {
          DEFAULT: "#4FB8A6",
          dim: "#2E6E63",
        },
        violet: {
          DEFAULT: "#9163f5",
          dim: "#493A8C",
          soft: "#a78bfa",
          // Constellation list page: people chips/edges (light) and the
          // battle accent (strong). DEFAULT stays #9163f5 for the rest of
          // the app and the brand gradient.
          light: "#A99BFF",
          strong: "#6E5FD9",
        },
        ink: {
          DEFAULT: "#F2F0E8",
          dim: "#c7cce0",
        },
        muted: "#8A93A6",
        // Quieter than muted -- mono kicker labels, secondary captions.
        dim: "#7C859B",
      },
      fontFamily: {
        sans: ["var(--font-vazirmatn)", "Tahoma", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
        // Display face for headings only — Lalezar is a single-weight,
        // decorative face; don't use it for body copy or long labels.
        display: ["var(--font-lalezar)", "var(--font-vazirmatn)", "Tahoma", "sans-serif"],
      },
      backgroundImage: {
        "sky-gradient":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(232,179,74,0.10), transparent), radial-gradient(ellipse 60% 50% at 90% 10%, rgba(79,184,166,0.08), transparent)",
        "constellation-gradient": "linear-gradient(135deg, #9163f5, #4FB8A6)",
        // Brand gradient — composite scores, primary CTAs (battle start), active nav badge.
        "gradient-brand": "linear-gradient(135deg, #9163f5, #4FB8A6)",
      },
      screens: {
        wide: "860px",
      },
    },
  },
  plugins: [],
};

export default config;
