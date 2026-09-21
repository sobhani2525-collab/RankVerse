"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { createList, addListItem, SearchResult } from "@/lib/api";
import AddListItem from "@/components/AddListItem";
import ListPreviewCard, { ListPreviewItem } from "@/components/ListPreviewCard";
import { entityTypeLabel } from "@/lib/constants";

export default function NewListForm() {
  const router = useRouter();
  const { getToken, user } = useAuth();
  const { requireAuth } = useAuthGate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState("movie");
  const [isRanked, setIsRanked] = useState(true);
  const [visibility, setVisibility] = useState("public");
  const [tagsInput, setTagsInput] = useState("");
  const [pendingItems, setPendingItems] = useState<ListPreviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lineDrawn, setLineDrawn] = useState(false);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!lineDrawn && value.trim().length > 0) setLineDrawn(true);
  }

  function handleSelectPending(result: SearchResult) {
    if (pendingItems.some((item) => item.id === result.id)) return;
    setPendingItems((prev) => [
      ...prev,
      {
        id: result.id,
        name: result.title,
        entity_type: result.type,
        posterUrl: result.image_url,
        score: null,
      },
    ]);
  }

  async function doCreate() {
    const token = getToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const result = await createList(token, {
        title,
        description: description || undefined,
        entity_type: entityType || undefined,
        is_ranked: isRanked,
        visibility,
        tags,
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
    <main className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="text-center text-2xl font-bold text-ink">ساخت لیست جدید</h1>
      <p className="mt-2 text-center text-sm text-muted">
        مثلاً «۱۰ بهترین فیلم اکشن» یا «۵ بهترین بازیگر تاریخ»
      </p>

      <div className="relative mt-10 grid grid-cols-1 gap-8 wide:grid-cols-[1fr_56px_1fr] wide:items-start">
        <form
          onSubmit={handleSubmit}
          className="order-2 flex flex-col gap-4 wide:order-1"
        >
          <div>
            <label className="mb-1 block text-sm text-muted">عنوان لیست</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted">توضیح (اختیاری)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted">دسته‌بندی</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            >
              <option value="movie">{entityTypeLabel("movie")}</option>
              <option value="tv_series">{entityTypeLabel("tv_series")}</option>
              <option value="person">{entityTypeLabel("person")}</option>
              <option value="">ترکیبی (چند نوع با هم)</option>
            </select>
            {entityType === "" && (
              <p className="mt-1 text-xs text-muted">
                مثل «بهترین ثنایی بازیگر-کارگردان» — هنگام افزودن آیتم، نوع هر مورد را جدا انتخاب می‌کنید.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5">
            <label className="text-sm text-muted">ترتیب‌دار باشد (رتبه‌بندی‌شده)</label>
            <input
              type="checkbox"
              checked={isRanked}
              onChange={(e) => setIsRanked(e.target.checked)}
              className="h-4 w-4 accent-gold"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted">نمایش</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            >
              <option value="public">عمومی</option>
              <option value="unlisted">با لینک قابل مشاهده</option>
              <option value="private">خصوصی</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted">برچسب‌ها (با کاما جدا کنید)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="اکشن, دهه ۹۰, دست‌کم‌گرفته‌شده"
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            />
          </div>

          <AddListItem
            entityType={entityType || null}
            onSelectPending={handleSelectPending}
            selectedIds={pendingItems.map((item) => item.id)}
          />

          {error && (
            <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
          >
            {submitting ? "در حال ساخت..." : "ساخت لیست"}
          </button>
        </form>

        <div
          aria-hidden
          className="hidden wide:order-2 wide:block wide:self-stretch"
        >
          <svg width="56" height="100%" className="h-full min-h-[420px] w-14" preserveAspectRatio="none">
            <defs>
              <linearGradient id="connector-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#7C5CFC" />
                <stop offset="1" stopColor="#4FB8A6" />
              </linearGradient>
            </defs>
            <path
              d="M 0 60 C 28 60, 28 60, 56 200"
              fill="none"
              stroke="url(#connector-gradient)"
              strokeWidth={2}
              strokeLinecap="round"
              className={`connector-draw ${lineDrawn ? "is-drawn" : ""}`}
              style={{ ["--len" as string]: 260 }}
            />
          </svg>
        </div>

        <div className="order-1 wide:order-3">
          <ListPreviewCard
            title={title}
            description={description}
            pendingItems={pendingItems}
            ownerName={user?.username ?? null}
          />
        </div>
      </div>
    </main>
  );
}
