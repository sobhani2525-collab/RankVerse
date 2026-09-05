"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { createList } from "@/lib/api";

export default function NewListPage() {
  const router = useRouter();
  const { token, isAuthenticated, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState("movie");
  const [isRanked, setIsRanked] = useState(true);
  const [visibility, setVisibility] = useState("public");
  const [tagsInput, setTagsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      router.push(`/lists/${result.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ساخت لیست");
    } finally {
      setSubmitting(false);
    }
  }

  if (!authLoading && !isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center px-6 text-center">
        <p className="text-muted">برای ساخت لیست ابتدا وارد حساب کاربری‌تان شوید.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-14">
      <h1 className="text-center text-2xl font-bold text-ink">ساخت لیست جدید</h1>
      <p className="mt-2 text-center text-sm text-muted">
        مثلاً «۱۰ بهترین فیلم اکشن» یا «۵ بهترین بازیگر تاریخ»
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-muted">عنوان لیست</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
            <option value="movie">فیلم</option>
            <option value="person">بازیگر / کارگردان</option>
          </select>
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
    </main>
  );
}