import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capTmdbSize } from "@/lib/tmdb-image-url";

describe("capTmdbSize", () => {
  it("keeps sizes at or under the mirror cap", () => {
    expect(capTmdbSize("w92")).toBe("w92");
    expect(capTmdbSize("w185")).toBe("w185");
    expect(capTmdbSize("w300")).toBe("w300");
  });

  it("shrinks anything bigger, including height and original sizes", () => {
    expect(capTmdbSize("w342")).toBe("w300");
    expect(capTmdbSize("w780")).toBe("w300");
    expect(capTmdbSize("h632")).toBe("w300");
    expect(capTmdbSize("original")).toBe("w300");
  });
});

describe("proxyTmdbUrl", () => {
  // The mirror base is read at import time, so each test imports afresh.
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it("caps the size only when going through the mirror", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMDB_IMAGE_BASE", "https://img.example.com/");
    const { proxyTmdbUrl } = await import("@/lib/tmdb-image-url");
    expect(proxyTmdbUrl("https://image.tmdb.org/t/p/w500/abc.jpg")).toBe("https://img.example.com/w300/abc.jpg");
    expect(proxyTmdbUrl("https://image.tmdb.org/t/p/w185/abc.jpg")).toBe("https://img.example.com/w185/abc.jpg");
    expect(proxyTmdbUrl("https://example.org/x.jpg")).toBe("https://example.org/x.jpg");
  });

  it("leaves TMDb URLs alone without a mirror", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMDB_IMAGE_BASE", "");
    const { proxyTmdbUrl } = await import("@/lib/tmdb-image-url");
    expect(proxyTmdbUrl("https://image.tmdb.org/t/p/w500/abc.jpg")).toBe("https://image.tmdb.org/t/p/w500/abc.jpg");
  });
});
