export const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
export const gaConfigured = /^G-[A-Z0-9]+$/.test(measurementId ?? "");
export const consentKey = "cinemagozin.analytics-consent";
const configuredContainerId = process.env.NEXT_PUBLIC_GA_CONTAINER_ID?.trim();
const localPreviewId = process.env.NODE_ENV === "development"
  ? process.env.NEXT_PUBLIC_GA_PREVIEW_CONTAINER_ID?.trim()
  : undefined;
const requestedContainerId = localPreviewId || configuredContainerId;
const containerId = /^GTM-[A-Z0-9]+$/.test(requestedContainerId ?? "")
  ? requestedContainerId
  : undefined;

type AnalyticsEvent =
  | ["sign_up", { method: "email" | "google" }]
  | ["battle_created" | "battle_published" | "list_create" | "list_published" | "list_item_add"]
  | ["battle_start" | "battle_complete", { surface: "arena" | "pool" }]
  | ["battle_vote", { surface: "daily" | "arena" | "tournament" | "pool" }]
  | ["list_item_vote"]
  | ["movie_finder_start", { surface: "search" | "tonight" }]
  | ["list_item_opened"];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

const staticPaths = new Set([
  "/", "/about", "/battles", "/battles/daily", "/battles/mine", "/battles/new",
  "/battles/result", "/contact", "/lists", "/lists/new", "/login", "/notifications",
  "/people", "/privacy", "/profile", "/rankings", "/register", "/terms",
]);
const detailSections = new Set(["battles", "genre", "lists", "list-tags", "movie", "movies", "people", "person", "track", "tv-series", "tv_series"]);
const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_content", "utm_term"];
const advertisingConsent = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
let active = false;
let initialized = false;
let consentGranted = false;
let lastPath: string | undefined;
let lastLocation: string | undefined;

export function analyticsPath(path: string): string | null {
  if (staticPaths.has(path)) return path;
  if (/^\/lists\/new\/[^/]+$/.test(path)) return "/lists/new/detail";
  const [, section, slug, extra] = path.split("/");
  return slug && extra === undefined && detailSections.has(section) ? `/${section}/detail` : null;
}

export function campaignQuery(search: string): string {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  for (const key of utmKeys) {
    const values = input.getAll(key);
    // Campaign labels are machine-readable slugs. Keep free text, emails and
    // ambiguous repeated parameters out of Analytics.
    if (values.length === 1 && /^[a-z][a-z0-9_-]{0,63}$/i.test(values[0])) output.set(key, values[0]);
  }
  return output.toString();
}

function externalReferrer(): string {
  try {
    const referrer = new URL(document.referrer);
    return /^https?:$/.test(referrer.protocol) && referrer.origin !== location.origin ? referrer.origin : "";
  } catch {
    return "";
  }
}

export function syncAnalytics(allowed: boolean, path: string, campaign: string) {
  if (!gaConfigured) return;
  const browser = window;
  const page = analyticsPath(path);
  const enabled = allowed && navigator.doNotTrack !== "1" && page !== null;
  const disableKey = `ga-disable-${measurementId}` as const;
  browser[disableKey] = !enabled;
  if (!enabled) {
    if (consentGranted && !allowed) {
      browser.gtag?.("consent", "update", { ...advertisingConsent, analytics_storage: "denied" });
      consentGranted = false;
    }
    active = false;
    lastPath = undefined;
    lastLocation = undefined;
    return;
  }

  if (active && lastPath === path) return;
  const pageLocation = location.origin + page + (!initialized && campaign ? `?${campaign}` : "");
  const context = {
    page_location: pageLocation,
    page_title: page,
    page_referrer: lastLocation ?? externalReferrer(),
    send_page_view: false,
  };

  if (!initialized) {
    browser.dataLayer ??= [];
    browser.gtag ??= function () { browser.dataLayer!.push(arguments); };
    browser.gtag("consent", "default", { ...advertisingConsent, analytics_storage: "denied" });
    browser.gtag("consent", "update", { ...advertisingConsent, analytics_storage: "granted" });
    if (containerId) {
      // The container may initialize independently of the inline config.
      browser.gtag("set", {
        ...context, allow_google_signals: false, allow_ad_personalization_signals: false,
      });
    }
    browser.gtag("js", new Date());
    browser.gtag("config", measurementId, {
      ...context, allow_google_signals: false, allow_ad_personalization_signals: false,
    });
    const script = document.createElement("script");
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = containerId
      ? `https://www.googletagmanager.com/gtm.js?id=${containerId}`
      : `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
    initialized = true;
  } else {
    if (!consentGranted) browser.gtag?.("consent", "update", { ...advertisingConsent, analytics_storage: "granted" });
    if (containerId) browser.gtag?.("set", context);
    else browser.gtag?.("config", measurementId, { ...context, update: true });
  }

  active = true;
  consentGranted = true;
  lastPath = path;
  lastLocation = location.origin + page;
  browser.gtag?.("event", "page_view", { ...context, send_to: measurementId });
}

export function trackAnalytics(...[event, parameters]: AnalyticsEvent) {
  if (typeof window === "undefined" || !active || location.pathname !== lastPath) return;
  try {
    window.gtag?.("event", event, { ...parameters, send_to: measurementId });
  } catch {
    // Analytics must never interrupt a successful action.
  }
}
