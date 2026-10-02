"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { getListBySlug, updateList, deleteList } from "@/lib/api";
import { encodeListSlug, listHref } from "@/lib/list-url";
import { toFaDigits } from "@/lib/format-number";
import type { ListDetail } from "@/lib/types";
import { ListViewerProvider, useListViewer } from "@/components/list-detail/ListViewerContext";
import { ListBattleProvider } from "@/components/list-detail/ListBattleContext";
import ListManageArea from "@/components/list-detail/ListManageArea";
import { MonoLabel } from "@/components/list-detail/ui";
import ListStepper from "@/components/ListStepper";
import ListEditPanel from "@/components/ListEditPanel";

const draftHref = (slug: string) => `/lists/new/${encodeListSlug(slug)}`;

// Mirrors MIN_ITEMS_TO_PUBLISH in app/modules/lists/service.py (the server enforces it).
const MIN_ITEMS = 5;

/** Publish/discard footer; reads the live item count, which updates as items are added. */
function PublishBar({
  publishing,
  onPublish,
  onDiscard,
}: {
  publishing: boolean;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  const { detail } = useListViewer();
  const count = detail.items.length;
  const remaining = MIN_ITEMS - count;
  const ready = remaining <= 0;
  // An item still being saved has a temp id; don't publish before it lands.
  const saving = detail.items.some((i) => i.id.startsWith("temp-"));

  return (
    <div className="mt-10 flex flex-col gap-4 border-t border-border-soft pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:max-w-[420px]">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: MIN_ITEMS }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < count ? "bg-teal" : "bg-border"}`} />
          ))}
        </div>
        <p className="text-xs leading-[1.8] text-dim">
          {ready
            ? `${toFaDigits(count)} آیتم در لیست است؛ آماده انتشار است.`
            : `برای انتشار حداقل ${toFaDigits(MIN_ITEMS)} آیتم لازم است؛ ${toFaDigits(count)} از ${toFaDigits(MIN_ITEMS)} اضافه شده، ${toFaDigits(remaining)} تای دیگر مانده.`}{" "}
          تا انتشار، فقط خودتان این لیست را می‌بینید.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="h-12 rounded-xl border border-red-500/40 px-4 text-sm text-red-400 transition hover:bg-red-500/10"
        >
          حذف پیش‌نویس
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing || !ready || saving}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gold px-8 text-[15px] font-extrabold text-bg transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          {publishing ? "در حال انتشار..." : "انتشار لیست"}
        </button>
      </div>
    </div>
  );
}

/**
 * Step 2 of 2: the private draft created by NewListForm. The list page's own
 * server render is anonymous (a private list 404s there), so this loads the
 * draft with the owner's token and reuses the list page's items section --
 * the same add-item panel, reorder and remove -- before publishing.
 */
export default function DraftListEditor({ slug }: { slug: string }) {
  const router = useRouter();
  const { token, loading: authLoading, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [detail, setDetail] = useState<ListDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState(false);

  // "?edit=1" (set after creating a list from a movie page) opens the details
  // form straight away; drop the param so a refresh doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") !== "1") return;
    setEditing(true);
    params.delete("edit");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
  }, []);

  async function reloadDetail() {
    const t = getToken();
    if (!t || !detail) return;
    try {
      setDetail(await getListBySlug(detail.slug, t));
    } catch {
      // keep what's shown; the next visit loads fresh data
    }
    setEditing(false);
  }

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      requireAuth(() => {});
      return;
    }
    let cancelled = false;
    getListBySlug(slug, token)
      .then((d) => {
        if (cancelled) return;
        if (!d.is_owner) setMissing(true);
        // Already published: nothing left to do here.
        else if (d.visibility === "public") router.replace(listHref(d.slug));
        else setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, slug, router, requireAuth]);

  async function doPublish() {
    const t = getToken();
    if (!t || !detail) return;
    setError(null);
    setPublishing(true);
    try {
      await updateList(t, detail.slug, { visibility: "public" });
      // Stays "publishing" through the navigation, like the old create button.
      router.push(listHref(detail.slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در انتشار لیست");
      setPublishing(false);
    }
  }

  async function doDiscard() {
    const t = getToken();
    if (!t || !detail) return;
    if (!confirm("این پیش‌نویس حذف می‌شود. مطمئنید؟")) return;
    try {
      await deleteList(t, detail.slug);
      router.push("/lists");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در حذف پیش‌نویس");
    }
  }

  if (missing) {
    return (
      <main className="mx-auto max-w-[760px] px-4 py-24 text-center">
        <p className="mb-4 text-ink">این پیش‌نویس پیدا نشد.</p>
        <Link href="/lists/new" className="text-teal hover:underline">
          ساخت لیست جدید
        </Link>
      </main>
    );
  }

  if (!detail) {
    return <main className="mx-auto max-w-[760px] px-4 py-24 text-center text-sm text-dim">در حال بارگذاری…</main>;
  }

  return (
    <ListViewerProvider key={detail.slug} slug={detail.slug} initialDetail={detail}>
      <ListBattleProvider>
        <main className="mx-auto max-w-[1100px] px-4 pb-14 pt-8 lg:px-10 lg:pt-[72px]">
          <div className="mb-8 flex flex-col gap-5">
            <MonoLabel className="text-violet-light">NEW LIST</MonoLabel>
            <ListStepper current={2} />
          </div>

          {editing ? (
            <div className="mb-10">
              <ListEditPanel
                slug={detail.slug}
                detail={detail}
                hrefFor={draftHref}
                allowDelete={false}
                onSaved={reloadDetail}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <header className="mb-10 flex flex-col gap-2 rounded-3xl border border-border bg-gradient-to-b from-surface to-surface/40 p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <span className="w-fit rounded-full border border-gold/40 bg-gold/10 px-3 py-0.5 text-xs font-bold text-gold">
                  پیش‌نویس
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="h-10 rounded-xl border border-border bg-surface px-4 text-sm text-muted transition hover:border-gold/40 hover:text-gold"
                >
                  ویرایش مشخصات
                </button>
              </div>
              <h1 className="text-2xl font-extrabold leading-snug text-ink lg:text-3xl">{detail.title}</h1>
              {detail.description && <p className="text-sm leading-relaxed text-ink-dim">{detail.description}</p>}
              {detail.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {detail.tags.map((t) => (
                    <span key={t} className="rounded-full border border-teal/35 bg-teal/[.08] px-3 py-0.5 text-[13px] text-teal">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </header>
          )}

          <ListManageArea />

          {error && (
            <p className="mt-8 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">{error}</p>
          )}

          <PublishBar publishing={publishing} onPublish={doPublish} onDiscard={doDiscard} />
        </main>
      </ListBattleProvider>
    </ListViewerProvider>
  );
}
