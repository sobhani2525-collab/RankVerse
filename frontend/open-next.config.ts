import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import dummyIncrementalCache from "@opennextjs/aws/overrides/incrementalCache/dummy.js";
import { MemoryQueue } from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import queueCache from "@opennextjs/cloudflare/overrides/queue/queue-cache";

// ISR / fetch cache for the Worker. Without an incrementalCache every
// request re-rendered and re-hit the backend (~1.5s per backend read), so
// `revalidate` did nothing in production.
//
// - Store: Workers KV (NEXT_INC_CACHE_KV in wrangler.jsonc) -- R2 needs a
//   card on file. Free plan: 1000 writes/day, hence the coarse TTLs in
//   lib/api.ts and the pages' `revalidate` exports.
// - Regional cache: per-colo Cache API copy in front of KV, so most hits
//   don't read KV at all.
// - Queue: stale pages are regenerated in the background through the
//   WORKER_SELF_REFERENCE service binding; queueCache de-dupes those
//   requests across isolates so one stale page isn't rebuilt (and written)
//   several times. The timeout is above the 10s default because a cold
//   home-page render can take that long against the backend.
//
// Set DISABLE_KV_CACHE=true as a build-time env var to swap in a no-op
// cache instead -- every request renders fresh, and nothing is read or
// written to KV. Use this while iterating with frequent deploys: each
// deploy's own cache-populate step is a KV bulk write, and combined with
// runtime ISR writes it can exhaust the free plan's 1000-writes/day cap
// (surfaced as Cloudflare API error code 10048, failing the deploy).
// Leave it unset for real production traffic, where the KV cache is what
// keeps pages fast.
const incrementalCache =
  process.env.DISABLE_KV_CACHE === "true"
    ? dummyIncrementalCache
    : withRegionalCache(kvIncrementalCache, { mode: "long-lived" });

export default defineCloudflareConfig({
  incrementalCache,
  queue: queueCache(new MemoryQueue({ revalidationTimeoutMs: 25_000 })),
  enableCacheInterception: true,
});
