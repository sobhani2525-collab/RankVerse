import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import dummyIncrementalCache from "@opennextjs/aws/overrides/incrementalCache/dummy.js";
import { MemoryQueue } from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import queueCache from "@opennextjs/cloudflare/overrides/queue/queue-cache";

// No Workers KV: the incremental (ISR/fetch) cache is a no-op, so every
// request renders fresh and nothing is read or written to KV. To bring a
// persistent cache back, add a kv_namespaces binding named NEXT_INC_CACHE_KV
// in wrangler.jsonc and use kvIncrementalCache from
// @opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache here.
export default defineCloudflareConfig({
  incrementalCache: dummyIncrementalCache,
  queue: queueCache(new MemoryQueue({ revalidationTimeoutMs: 25_000 })),
  enableCacheInterception: true,
});
