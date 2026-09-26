import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * For cached (ISR) pages about to render a "backend unreachable" state.
 *
 * At request time this rethrows instead: a failed regeneration leaves the
 * last good version in the cache (Workers KV, see open-next.config.ts), and
 * a page with nothing cached yet shows app/error.tsx -- rather than the
 * error state being cached and served for the page's whole revalidate
 * window. During `next build` it's a no-op, so a backend blip can't fail a
 * deploy; that prerendered error state is replaced on the first
 * revalidation.
 */
export function rethrowOutsideBuild(err: unknown): void {
  if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw err;
}
