import { Vazirmatn, IBM_Plex_Mono, Lalezar } from "next/font/google";

// Body / UI text — Persian, full weight range.
export const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-vazirmatn",
  display: "swap",
});

// Data-heavy elements: scores, dates, counts, IDs.
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Headings only (h1/h2, wordmark, big scores) — Lalezar ships one
// weight, so it's not suited to body copy or dense labels.
export const lalezar = Lalezar({
  subsets: ["arabic"],
  weight: "400",
  variable: "--font-lalezar",
  display: "swap",
});
