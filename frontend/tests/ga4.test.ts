import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document.querySelector('script[src*="googletagmanager"]')?.remove();
  window.history.replaceState(null, "", "/");
});

it("gates the tag on consent, deduplicates page views and sanitizes navigation data", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-6NWFR3VKQP");
  const { campaignQuery, syncAnalytics, trackAnalytics } = await import("../lib/ga4");
  const tag = vi.fn();
  vi.stubGlobal("gtag", tag);
  window.history.replaceState(null, "", "/?utm_source=instagram&utm_medium=social&utm_campaign=bio&email=name%40example.com&utm_term=name%40example.com");
  const campaign = campaignQuery(location.search);
  expect(campaign).toBe("utm_source=instagram&utm_medium=social&utm_campaign=bio");

  syncAnalytics(false, "/", campaign);
  trackAnalytics("sign_up", { method: "email" });
  expect(tag).not.toHaveBeenCalled();
  expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();

  syncAnalytics(true, "/", campaign);
  syncAnalytics(true, "/", campaign);
  window.history.replaceState(null, "", "/?q=a-private-search");
  syncAnalytics(true, "/", campaign);
  trackAnalytics("sign_up", { method: "email" });
  window.history.pushState(null, "", "/lists/private-user-title");
  syncAnalytics(true, location.pathname, campaign);
  window.history.pushState(null, "", "/lists/another-title");
  syncAnalytics(true, location.pathname, campaign);
  window.history.pushState(null, "", "/reset-password?token=private-token");
  syncAnalytics(true, location.pathname, campaign);
  trackAnalytics("list_create");
  syncAnalytics(false, location.pathname, campaign);

  const events = tag.mock.calls.filter(([kind]) => kind === "event");
  expect(events.map(([, event]) => event)).toEqual(["page_view", "sign_up", "page_view", "page_view"]);
  expect(events[0][2]).toMatchObject({ page_location: location.origin + "/?" + campaign });
  expect(events[2][2]).toMatchObject({ page_location: location.origin + "/lists/detail" });
  expect(JSON.stringify(tag.mock.calls)).not.toMatch(/private-|another-title|example\.com/);
  expect(tag).toHaveBeenLastCalledWith("consent", "update", expect.objectContaining({ analytics_storage: "denied" }));
});

it.each([
  ["development", "", "gtm.js?id=GTM-WWQDDDL8"],
  ["production", "", "gtag/js?id=G-6NWFR3VKQP"],
  ["production", "GTM-WWQDDDL8", "gtm.js?id=GTM-WWQDDDL8"],
] as const)("selects the expected loader in %s with container %j", async (environment, configuredId, loader) => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", environment);
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-6NWFR3VKQP");
  vi.stubEnv("NEXT_PUBLIC_GA_CONTAINER_ID", configuredId);
  vi.stubEnv("NEXT_PUBLIC_GA_PREVIEW_CONTAINER_ID", "GTM-WWQDDDL8");
  const { syncAnalytics } = await import("../lib/ga4");
  const tag = vi.fn();
  vi.stubGlobal("gtag", tag);
  const campaign = "utm_source=instagram&utm_medium=social&utm_campaign=bio";

  syncAnalytics(false, "/", campaign);
  expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  syncAnalytics(true, "/", campaign);
  syncAnalytics(true, "/", campaign);
  window.history.pushState(null, "", "/lists?email=private");
  syncAnalytics(true, location.pathname, campaign);

  expect(document.querySelector<HTMLScriptElement>('script[src*="googletagmanager"]')?.src)
    .toBe(`https://www.googletagmanager.com/${loader}`);
  const views = tag.mock.calls.filter(([command, name]) => command === "event" && name === "page_view");
  expect(views.map(([, , data]) => data)).toMatchObject([
    { send_to: "G-6NWFR3VKQP", page_location: `${location.origin}/?${campaign}` },
    { send_to: "G-6NWFR3VKQP", page_location: `${location.origin}/lists` },
  ]);
  if (loader.startsWith("gtm.js")) {
    expect(tag).toHaveBeenCalledWith("set", expect.objectContaining({ send_page_view: false }));
  }
});
