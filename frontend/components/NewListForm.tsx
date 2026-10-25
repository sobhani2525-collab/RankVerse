"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { createList } from "@/lib/api";
import { encodeListSlug } from "@/lib/list-url";
import ListFormFields from "@/components/ListFormFields";
import SimilarListsHint from "@/components/SimilarListsHint";
import ListStepper from "@/components/ListStepper";

const TITLE_EXAMPLES = ["۱۰ بهترین فیلم اکشن", "فیلم‌های نولان به ترتیب علاقه", "انیمه‌های آخر هفته", "سریال‌هایی که یک‌نفس دیدم"];

/**
 * Step 1 of 2: the list's identity (title, description, tags). Submitting
 * creates a private draft and moves on to /lists/new/[slug], where items are
 * added with the same panel the finished list page uses and the draft is
 * published. Every list is community-ordered and open to anyone's
 * contributions once public (see ListService.create_list).
 */
export default function NewListForm() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Rotated after mount -- a random pick during render would mismatch the SSR HTML.
  const [example, setExample] = useState(TITLE_EXAMPLES[0]);
  useEffect(() => {
    setExample(TITLE_EXAMPLES[Math.floor(Math.random() * TITLE_EXAMPLES.length)]);
  }, []);

  async function doCreate() {
    const token = getToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createList(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        tags,
        visibility: "private",
      });
      // submitting stays true through the navigation so the button keeps
      // its loading state until the next step renders.
      router.push(`/lists/new/${encodeListSlug(result.slug)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ساخت فهرست");
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    requireAuth(doCreate);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <ListStepper current={1} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <ListFormFields
          title={title}
          description={description}
          tags={tags}
          onTitleChange={setTitle}
          onDescriptionChange={setDescription}
          onTagsChange={setTags}
          titlePlaceholder={`مثلاً «${example}»`}
          autoFocus
          titleHint={<SimilarListsHint title={title} />}
        />

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="flex flex-col items-start gap-3">
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-gold px-6 py-2.5 text-sm font-bold text-bg disabled:opacity-50"
          >
            {submitting && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {submitting ? "در حال ساخت…" : "مرحلهٔ بعد"}
          </button>
          <p className="text-sm text-muted">
            فهرست تا زمانی که منتشرش نکنید پیش‌نویس است و فقط خودتان آن را می‌بینید.
          </p>
        </div>
      </form>
    </main>
  );
}
