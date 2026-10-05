"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/**
 * Privacy-friendly, cookie-less page analytics (Umami or Plausible). Renders
 * nothing unless configured, so it is safe to ship before any account exists:
 *
 *   NEXT_PUBLIC_ANALYTICS_PROVIDER = "umami" | "plausible"
 *   NEXT_PUBLIC_ANALYTICS_SCRIPT   = script URL (e.g. https://analytics.example.com/script.js)
 *   NEXT_PUBLIC_ANALYTICS_SITE_ID  = Umami website id, or the Plausible domain
 *
 * Both scripts track client-side route changes on their own, so no manual
 * page-view calls are needed. The admin panel is never tracked.
 */
const PROVIDER = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER;
const SRC = process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT;
const SITE_ID = process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID;

export default function Analytics() {
  const pathname = usePathname();
  if (!SRC || !SITE_ID || (PROVIDER !== "umami" && PROVIDER !== "plausible")) return null;
  if (pathname?.startsWith("/admin")) return null;

  return PROVIDER === "umami" ? (
    <Script src={SRC} data-website-id={SITE_ID} data-do-not-track="true" strategy="afterInteractive" />
  ) : (
    <Script src={SRC} data-domain={SITE_ID} strategy="afterInteractive" defer />
  );
}
