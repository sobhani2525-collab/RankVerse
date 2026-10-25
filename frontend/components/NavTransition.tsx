"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Soft page changes for the server-rendered browse pages (rankings, people,
 * genre): a pager or filter click navigates inside a transition, so the
 * current grid stays on screen -- dimmed, under a loader -- until the next
 * page has arrived, then fades in and the view glides back to the top of the
 * results. Without a provider the links below behave like plain links.
 */

interface NavTransition {
  pending: boolean;
  navigate: (href: string) => void;
}

const Ctx = createContext<NavTransition | null>(null);

export function useNavTransition(): NavTransition | null {
  return useContext(Ctx);
}

export function NavTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const scrollAfter = useRef(false);

  const navigate = useCallback(
    (href: string) => {
      scrollAfter.current = true;
      startTransition(() => router.push(href, { scroll: false }));
    },
    [router],
  );

  useEffect(() => {
    if (pending || !scrollAfter.current) return;
    scrollAfter.current = false;
    const anchor = document.getElementById(RESULTS_ID);
    if (!anchor) return;
    // Only glide up when the top of the results is out of view.
    if (anchor.getBoundingClientRect().top < 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      anchor.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [pending]);

  return <Ctx.Provider value={{ pending, navigate }}>{children}</Ctx.Provider>;
}

const RESULTS_ID = "browse-results";

/**
 * The results area. `contentKey` changes with every page / filter set, which
 * remounts the content so it fades in fresh.
 */
export function NavTransitionBody({ contentKey, children }: { contentKey: string; children: ReactNode }) {
  const nav = useNavTransition();
  const pending = nav?.pending ?? false;
  return (
    <div id={RESULTS_ID} className="scroll-mt-24">
      <LoadingArea loading={pending} contentKey={contentKey}>
        {children}
      </LoadingArea>
    </div>
  );
}

/**
 * Dims its content under a sticky "loading" pill while `loading` -- the same
 * look for server-rendered grids (via NavTransitionBody) and grids that fetch
 * in the browser (lists, battles). A changed `contentKey` fades the content in.
 */
export function LoadingArea({ loading, contentKey, className = "", children }: { loading: boolean; contentKey?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`relative ${className}`} aria-busy={loading}>
      <div key={contentKey} className={`${contentKey !== undefined ? "rv-fade-in " : ""}transition-opacity duration-300 ${loading ? "pointer-events-none opacity-40" : ""}`}>
        {children}
      </div>
      {loading && (
        <div role="status" className="pointer-events-none absolute inset-0 flex min-h-[8rem] flex-col items-center">
          <span className="sticky top-[40vh] mt-16 flex items-center gap-3 rounded-full border border-border bg-surface/90 px-4 py-2 text-sm text-ink shadow-lg backdrop-blur">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" aria-hidden="true" />
            در حال بارگذاری…
          </span>
        </div>
      )}
    </div>
  );
}

/** A Link that goes through the transition when a provider is present. */
export function TransitionLink({
  href,
  className,
  children,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page";
  "aria-label"?: string;
  "aria-selected"?: boolean;
  role?: string;
}) {
  const nav = useNavTransition();
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (!nav || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        nav.navigate(href);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
