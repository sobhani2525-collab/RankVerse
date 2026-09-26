import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
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
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(kvIncrementalCache, { mode: "long-lived" }),
  queue: queueCache(new MemoryQueue({ revalidationTimeoutMs: 25_000 })),
  enableCacheInterception: true,
});
