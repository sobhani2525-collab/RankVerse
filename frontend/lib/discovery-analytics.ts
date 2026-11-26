import { gaConfigured, trackAnalytics } from "./ga4";

type DiscoveryEvent = "Tonight pick opened" | "List item opened";
type DiscoveryProperties = { destination: string; placement: string };

export function trackDiscovery(event: DiscoveryEvent, props: DiscoveryProperties) {
  if (gaConfigured) {
    if (event === "Tonight pick opened") {
      trackAnalytics("movie_finder_start", { surface: "tonight" });
    } else {
      trackAnalytics("list_item_opened");
    }
    return;
  }
  const browser = window as Window & {
    umami?: { track: (name: string, properties: DiscoveryProperties) => unknown };
    plausible?: (name: string, options: { props: DiscoveryProperties }) => unknown;
  };
  if (navigator.doNotTrack === "1") return;

  try {
    const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER;
    if (provider === "umami") {
      void Promise.resolve(browser.umami?.track(event, props)).catch(() => {});
    } else if (provider === "plausible") {
      void Promise.resolve(browser.plausible?.(event, { props })).catch(() => {});
    }
  } catch {
    // Analytics must never interrupt navigation.
  }
}
