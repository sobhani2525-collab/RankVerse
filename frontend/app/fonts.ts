import { Vazirmatn, JetBrains_Mono, Lalezar } from "next/font/google";

// Body / UI text — Persian, full weight range.
export const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

// Data-heavy elements: scores, dates, counts, IDs.
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

// Headings only (h1/h2, wordmark) — Lalezar ships one weight, so it's
// not suited to body copy or dense labels.
export const lalezar = Lalezar({
  subsets: ["arabic"],
  weight: "400",
  variable: "--font-lalezar",
  display: "swap",
});
