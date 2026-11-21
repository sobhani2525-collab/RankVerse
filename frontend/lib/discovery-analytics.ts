type DiscoveryEvent = "Tonight pick opened" | "List item opened";
type DiscoveryProperties = { destination: string; placement: string };

export function trackDiscovery(event: DiscoveryEvent, props: DiscoveryProperties) {
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
