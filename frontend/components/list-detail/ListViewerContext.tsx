"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getListBySlug } from "@/lib/api";
import type { ListDetail } from "@/lib/types";

/**
 * The list page renders from an anonymous server fetch (so the spine, hero
 * and DNA stay server components), then this provider refetches with the
 * viewer's token for the per-viewer fields (is_owner, is_liked,
 * is_following, can_remove, my_vote) that the client islands read.
 *
 * The follower/like counts live here too, so the hero buttons and the
 * DNA's follower stat move together on an optimistic toggle.
 *
 * The spine and the hero's graph line render from `detail` here, so an
 * item added from the add form appears (and animates in) immediately via
 * setItemsDetail; the next refetch swaps in the server's edges/backlinks.
 */
interface ListViewerState {
  slug: string;
  detail: ListDetail;
  liked: boolean;
  likeCount: number;
  following: boolean;
  followerCount: number;
  setLike: (liked: boolean, likeCount: number) => void;
  setFollow: (following: boolean, followerCount: number) => void;
  /** Re-render the server components (after an edit) and refetch. */
  refresh: () => void;
  /** Replace the items/edges/backlinks locally (optimistic add, or its rollback). */
  setItemsDetail: React.Dispatch<React.SetStateAction<ListDetail>>;
  /** Entity id of the item that just joined the spine, while its entrance animates. */
  justAddedEntityId: string | null;
  markJustAdded: (entityId: string) => void;
}

// Long enough for the whole entrance (the edge fade is 420ms + 120ms delay).
const JUST_ADDED_MS = 700;

const ListViewerContext = createContext<ListViewerState | null>(null);

export function ListViewerProvider({
  slug,
  initialDetail,
  children,
}: {
  slug: string;
  initialDetail: ListDetail;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState(initialDetail);
  const [social, setSocial] = useState({
    liked: initialDetail.is_liked,
    likeCount: initialDetail.like_count,
    following: initialDetail.is_following,
    followerCount: initialDetail.follower_count,
  });

  const [justAddedEntityId, setJustAddedEntityId] = useState<string | null>(null);
  const justAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (justAddedTimer.current) clearTimeout(justAddedTimer.current);
  }, []);

  const markJustAdded = useCallback((entityId: string) => {
    if (justAddedTimer.current) clearTimeout(justAddedTimer.current);
    setJustAddedEntityId(entityId);
    // Drop the animation classes once they've run so nothing replays.
    justAddedTimer.current = setTimeout(() => setJustAddedEntityId(null), JUST_ADDED_MS);
  }, []);

  const applyDetail = useCallback((next: ListDetail) => {
    setDetail(next);
    setSocial({
      liked: next.is_liked,
      likeCount: next.like_count,
      following: next.is_following,
      followerCount: next.follower_count,
    });
  }, []);

  // After router.refresh() the server hands down a new (anonymous)
  // initialDetail. A logged-in viewer keeps their current per-viewer
  // state until the authed refetch below replaces it, so owner tools
  // don't flicker away in between.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!token) applyDetail(initialDetail);
  }, [initialDetail, token, applyDetail]);

  useEffect(() => {
    if (authLoading || !token) return;
    let cancelled = false;
    getListBySlug(slug, token)
      .then((next) => {
        if (!cancelled) applyDetail(next);
      })
      .catch(() => {
        // keep the publicly-fetched detail if the authenticated refetch fails
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, slug, initialDetail, applyDetail]);

  const value: ListViewerState = {
    slug,
    detail,
    ...social,
    setLike: (liked, likeCount) => setSocial((s) => ({ ...s, liked, likeCount })),
    setFollow: (following, followerCount) => setSocial((s) => ({ ...s, following, followerCount })),
    refresh: () => router.refresh(),
    setItemsDetail: setDetail,
    justAddedEntityId,
    markJustAdded,
  };

  return <ListViewerContext.Provider value={value}>{children}</ListViewerContext.Provider>;
}

export function useListViewer(): ListViewerState {
  const ctx = useContext(ListViewerContext);
  if (!ctx) throw new Error("useListViewer must be used inside ListViewerProvider");
  return ctx;
}
