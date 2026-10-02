"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { updateList, deleteList } from "@/lib/api";
import { ListDetail } from "@/lib/types";
import { listHref } from "@/lib/list-url";
import ListFormFields from "@/components/ListFormFields";

/** Same fields and look as the new-list form (see ListFormFields). */
export default function ListEditPanel({
  slug,
  detail,
  onSaved,
  onCancel,
  hrefFor = listHref,
  allowDelete = true,
}: {
  slug: string;
  detail: ListDetail;
  onSaved: () => void;
  onCancel: () => void;
  /** Where to go if a new title moves the list to a new slug (drafts live under /lists/new). */
  hrefFor?: (slug: string) => string;
  allowDelete?: boolean;
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? "");
  const [tags, setTags] = useState<string[]>(detail.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const token = getToken();
    if (!token || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { slug: newSlug } = await updateList(token, slug, {
        title: title.trim(),
        description: description.trim() || undefined,
        tags,
      });
      // A new title moves the list to a new slug; the old URL would only
      // redirect, so go straight there.
      if (newSlug !== slug) {
        router.replace(hrefFor(newSlug));
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره تغییرات");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setTitle(detail.title);
    setDescription(detail.description ?? "");
    setTags(detail.tags ?? []);
    setError(null);
    onCancel();
  }

  async function handleDelete() {
    const token = getToken();
    if (!token) return;
    if (!confirm("این فهرست برای همیشه حذف می‌شود. مطمئنید؟")) return;
    try {
      await deleteList(token, slug);
      router.push("/lists");
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در حذف فهرست");
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-7 rounded-3xl border border-border bg-gradient-to-b from-surface to-surface/40 p-5 sm:p-8">
      <ListFormFields
        title={title}
        description={description}
        tags={tags}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onTagsChange={setTags}
      />

      {error && (
        <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">{error}</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="h-12 flex-1 rounded-xl bg-gold px-8 text-[15px] font-extrabold text-bg transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {saving ? "در حال ذخیره..." : "ذخیره"}
          </button>
          <button
            onClick={handleCancel}
            className="h-12 rounded-xl border border-border px-5 text-sm text-muted transition hover:border-gold/40"
          >
            انصراف
          </button>
        </div>
        {allowDelete && (
          <button
            onClick={handleDelete}
            className="h-12 rounded-xl border border-red-500/40 px-4 text-sm text-red-400 transition hover:bg-red-500/10"
          >
            حذف فهرست
          </button>
        )}
      </div>
    </div>
  );
}
