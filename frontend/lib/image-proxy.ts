import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Server side of /tmdb-img/<size>/<file>: posters served from our own Liara
 * app (inside Iran) instead of the browser fetching them from Cloudflare,
 * whose IPs Iranian networks throttle. TMDb itself is unreachable from Liara,
 * so each poster is fetched once from our Cloudflare mirrors and kept on the
 * container's disk. The disk is wiped on redeploy; posters are then fetched
 * again on first use.
 */

// Same whitelist as the mirror Worker: only TMDb image paths, nothing else.
const IMAGE_PATH = /^(?:w\d{2,4}|h\d{2,4}|original)\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/;

const UPSTREAMS = (
  process.env.TMDB_IMAGE_UPSTREAMS ||
  "https://img.cinemagozin.ir,https://tmdb-image-proxy.sobhani2525.workers.dev"
)
  .split(",")
  .map((u) => u.trim().replace(/\/+$/, ""))
  .filter(Boolean);

// Liara fetches a poster from Cloudflare in ~0.2-0.5s, but now and then one
// mirror hangs; give up on it quickly and try the next.
const UPSTREAM_TIMEOUT_MS = 5_000;
const CACHE_DIR = process.env.TMDB_IMAGE_CACHE_DIR || path.join(tmpdir(), "tmdb-img-cache");
// Stop writing new files past this much, so a crawl can't fill the disk.
const MAX_CACHE_BYTES = Number(process.env.TMDB_IMAGE_CACHE_MAX_MB || 1500) * 1024 * 1024;

let cachedBytes = 0;
const inFlight = new Map<string, Promise<FetchedImage | null>>();

export type FetchedImage = { body: Buffer; contentType: string; source: "cache" | string };

export function isImagePath(imagePath: string): boolean {
  return IMAGE_PATH.test(imagePath);
}

function contentTypeFor(imagePath: string): string {
  const ext = imagePath.slice(imagePath.lastIndexOf(".") + 1);
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

function cacheFile(imagePath: string): string {
  return path.join(CACHE_DIR, imagePath.replace("/", "_"));
}

/** One upstream attempt; a cut-off body (fewer bytes than Content-Length) counts as a failure. */
async function fetchUpstream(base: string, imagePath: string): Promise<Buffer | "missing" | null> {
  try {
    const res = await fetch(`${base}/${imagePath}`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), cache: "no-store" });
    if (res.status === 404) return "missing";
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    const expected = Number(res.headers.get("content-length"));
    if (!body.length || (expected && body.length !== expected)) return null;
    return body;
  } catch {
    return null;
  }
}

async function load(imagePath: string): Promise<FetchedImage | null> {
  const file = cacheFile(imagePath);
  try {
    return { body: await readFile(file), contentType: contentTypeFor(imagePath), source: "cache" };
  } catch {
    // not cached yet
  }

  let missing = 0;
  for (const base of UPSTREAMS) {
    const got = await fetchUpstream(base, imagePath);
    if (got === "missing") {
      missing += 1;
      continue;
    }
    if (!got) continue;
    if (cachedBytes + got.length <= MAX_CACHE_BYTES) {
      // Write-then-rename so a concurrent reader never sees half a file.
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(tmp, got);
        await rename(tmp, file);
        cachedBytes += got.length;
      } catch {
        // A full or read-only disk only costs the cache, not the response.
      }
    }
    return { body: got, contentType: contentTypeFor(imagePath), source: new URL(base).host };
  }
  // Every upstream answered 404: TMDb has no such image.
  return missing === UPSTREAMS.length ? null : Promise.reject(new Error("upstreams unavailable"));
}

/** The image for "w300/abc.jpg": from disk, else from the first mirror that delivers it whole. */
export function getImage(imagePath: string): Promise<FetchedImage | null> {
  let pending = inFlight.get(imagePath);
  if (!pending) {
    pending = load(imagePath).finally(() => inFlight.delete(imagePath));
    inFlight.set(imagePath, pending);
  }
  return pending;
}
