import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capTmdbSize } from "@/lib/tmdb-image-url";

describe("capTmdbSize", () => {
  it("keeps sizes at or under the mirror cap", () => {
    expect(capTmdbSize("w92")).toBe("w92");
    expect(capTmdbSize("w342")).toBe("w342");
    expect(capTmdbSize("w500")).toBe("w500");
  });

  it("shrinks anything bigger, including height and original sizes", () => {
    expect(capTmdbSize("w780")).toBe("w500");
    expect(capTmdbSize("h632")).toBe("w500");
    expect(capTmdbSize("original")).toBe("w500");
  });
});

describe("proxyTmdbUrl", () => {
  // The mirror base is read at import time, so each test imports afresh.
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("caps the size only when going through the mirror", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMDB_IMAGE_BASE", "https://example.com/tmdb-img/");
    const { proxyTmdbUrl } = await import("@/lib/tmdb-image-url");
    expect(proxyTmdbUrl("https://image.tmdb.org/t/p/w780/abc.jpg")).toBe("https://example.com/tmdb-img/w500/abc.jpg");
    expect(proxyTmdbUrl("https://image.tmdb.org/t/p/w185/abc.jpg")).toBe("https://example.com/tmdb-img/w185/abc.jpg");
    expect(proxyTmdbUrl("https://example.org/x.jpg")).toBe("https://example.org/x.jpg");
  });

  it("leaves TMDb URLs alone without a mirror", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMDB_IMAGE_BASE", "");
    const { proxyTmdbUrl } = await import("@/lib/tmdb-image-url");
    expect(proxyTmdbUrl("https://image.tmdb.org/t/p/w780/abc.jpg")).toBe("https://image.tmdb.org/t/p/w780/abc.jpg");
  });
});
