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
        surface: "#12172A",
        surface2: "#1A2036",
        border: "#232A42",
        gold: {
          DEFAULT: "#E8B34A",
          dim: "#8A6B2E",
        },
        teal: {
          DEFAULT: "#4FB8A6",
          dim: "#2E6E63",
        },
        ink: "#F2F0E8",
        muted: "#8A93A6",
      },
      fontFamily: {
        sans: ["var(--font-vazirmatn)", "Tahoma", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      backgroundImage: {
        "sky-gradient":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(232,179,74,0.10), transparent), radial-gradient(ellipse 60% 50% at 90% 10%, rgba(79,184,166,0.08), transparent)",
      },
    },
  },
  plugins: [],
};

export default config;
