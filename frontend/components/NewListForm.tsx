"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { createList, addListItem, SearchResult } from "@/lib/api";
import AddListItem from "@/components/AddListItem";
import EntityCard from "@/components/entities/entity-card";
import { SectionHeading, MonoLabel } from "@/components/list-detail/ui";
import { entityTypeLabel } from "@/lib/constants";

interface PendingItem {
  id: string;
  slug: string;
  name: string;
  entity_type: string;
  posterUrl: string | null;
}

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: "movie", label: entityTypeLabel("movie") },
  { value: "tv_series", label: entityTypeLabel("tv_series") },
  { value: "person", label: entityTypeLabel("person") },
  { value: "", label: "ترکیبی" },
];

/**
 * Styled like the list detail page itself (hero title/description, then a
 * NODES section) rather than a generic form, so composing a list already
 * looks like the page it becomes. Every manually-created list is public,
 * open to anyone's contributions and community-ordered -- there's no
 * per-list choice for any of that (see ListService.create_list).
 */
export default function NewListForm() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState("movie");
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSelectPending(result: SearchResult) {
    if (pendingItems.some((item) => item.id === result.id)) return;
    setPendingItems((prev) => [
      ...prev,
      { id: result.id, slug: result.slug, name: result.title, entity_type: result.type, posterUrl: result.image_url },
    ]);
  }

  function handleRemovePending(id: string) {
    setPendingItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function doCreate() {
    const token = getToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createList(token, {
        title,
        description: description || undefined,
        entity_type: entityType || undefined,
      });

      for (const item of pendingItems) {
        try {
          await addListItem(token, result.slug, { entity_id: item.id });
        } catch {
          // list is already created -- keep going so one bad item doesn't
          // block the rest; the user can retry failed adds from the list page.
        }
      }

      router.push(`/lists/${result.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ساخت لیست");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    requireAuth(doCreate);
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-14 lg:px-20">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex min-w-0 flex-col gap-[18px] pb-9 pt-8 lg:gap-6 lg:pb-14 lg:pt-[72px]">
          <MonoLabel className="text-violet-light">NEW LIST</MonoLabel>

          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان لیست، مثلاً «۱۰ بهترین فیلم اکشن»"
            className="w-full bg-transparent text-[30px] font-black leading-[1.35] text-ink outline-none placeholder:text-dim lg:text-[56px] lg:leading-[1.2]"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="توضیح کوتاه لیست (اختیاری)"
            rows={2}
            className="max-w-[720px] resize-none bg-transparent text-[15px] leading-[1.9] text-ink-dim outline-none placeholder:text-dim lg:text-lg"
          />

          <div
            className="flex w-fit gap-1 rounded-[10px] border border-border bg-[#0E121C] p-[3px]"
            role="group"
            aria-label="دسته‌بندی"
          >
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value || "mixed"}
                type="button"
                onClick={() => setEntityType(tab.value)}
                aria-pressed={entityType === tab.value}
                className={`h-[38px] flex-1 rounded-lg px-4 text-[13px] font-bold transition-[background-color,color] duration-[160ms] ${
                  entityType === tab.value ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <section aria-labelledby="new-list-nodes-heading" className="flex flex-col">
          <div className="mb-6 border-b border-border-soft pb-5 lg:mb-9 lg:pb-7" id="new-list-nodes-heading">
            <SectionHeading en="NODES" fa="آیتم‌های لیست" />
          </div>

          <div className="rounded-2xl border border-dashed border-[#2C4A48] bg-[#0C1119] p-4 lg:rounded-[18px] lg:p-[22px]">
            <AddListItem
              entityType={entityType || null}
              onSelectPending={handleSelectPending}
              selectedIds={pendingItems.map((item) => item.id)}
            />
          </div>

          {pendingItems.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {pendingItems.map((item) => (
                <div key={item.id} className="relative">
                  <EntityCard
                    showFavoriteAction={false}
                    entity={{
                      id: item.id,
                      slug: item.slug,
                      title: item.name,
                      entity_type: item.entity_type,
                      posterUrl: item.posterUrl,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="حذف از لیست"
                    onClick={() => handleRemovePending(item.id)}
                    className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink backdrop-blur-sm transition hover:border-red-500/50 hover:text-red-400 md:h-9 md:w-9"
                    style={{ background: "rgba(7,11,22,.7)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <p className="mt-8 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-10 h-12 self-stretch rounded-xl bg-gold text-[15px] font-extrabold text-bg transition hover:bg-gold/90 disabled:opacity-50 lg:self-start lg:px-10"
        >
          {submitting ? "در حال ساخت..." : "ساخت لیست"}
        </button>
      </form>
    </main>
  );
}
