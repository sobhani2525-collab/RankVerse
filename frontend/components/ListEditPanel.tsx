"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { updateList, deleteList } from "@/lib/api";
import { ListDetail } from "@/lib/types";
import ListSettings from "./ListSettings";

export default function ListEditPanel({
  slug,
  detail,
  onSaved,
  onCancel,
}: {
  slug: string;
  detail: ListDetail;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const token = getToken();
    if (!token || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateList(token, slug, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره تغییرات");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setTitle(detail.title);
    setDescription(detail.description ?? "");
    setError(null);
    onCancel();
  }

  async function handleDelete() {
    const token = getToken();
    if (!token) return;
    if (!confirm("این لیست برای همیشه حذف می‌شود. مطمئنید؟")) return;
    try {
      await deleteList(token, slug);
      router.push("/lists");
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در حذف لیست");
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-surface/60 p-4">
      <div>
        <label className="mb-1 block text-xs text-muted">عنوان</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted">توضیح</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
        />
      </div>

      <ListSettings
        slug={slug}
        initialListType={detail.list_type}
        initialContributionMode={detail.contribution_mode}
        onChanged={onSaved}
      />

      {error && <p className="text-sm text-gold">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
          >
            {saving ? "در حال ذخیره..." : "ذخیره"}
          </button>
          <button
            onClick={handleCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:border-gold/40"
          >
            انصراف
          </button>
        </div>
        <button
          onClick={handleDelete}
          className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
        >
          حذف لیست
        </button>
      </div>
    </div>
  );
}
