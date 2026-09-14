"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateList } from "@/lib/api";
import { ListType, ListContributionMode } from "@/lib/types";

const LIST_TYPE_LABELS: Record<ListType, string> = {
  ranked: "رتبه‌بندی‌شده توسط سازنده",
  community_ordered: "ترتیب بر اساس رای جامعه",
};

const CONTRIBUTION_MODE_LABELS: Record<ListContributionMode, string> = {
  owner_only: "فقط سازنده",
  anyone: "همه کاربران",
  followers_only: "فقط فالوورها",
};

export default function ListSettings({
  slug,
  initialListType,
  initialContributionMode,
  onChanged,
}: {
  slug: string;
  initialListType: ListType;
  initialContributionMode: ListContributionMode;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [listType, setListType] = useState<ListType>(initialListType);
  const [contributionMode, setContributionMode] = useState<ListContributionMode>(initialContributionMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: { list_type?: ListType; contribution_mode?: ListContributionMode }) {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await updateList(token, slug, next);
      if (next.list_type) setListType(next.list_type);
      if (next.contribution_mode) setContributionMode(next.contribution_mode);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره تنظیمات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface/60 p-4">
      <p className="mb-3 text-sm font-medium text-ink">تنظیمات لیست</p>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted">نوع ترتیب‌بندی</label>
        <select
          value={listType}
          disabled={saving}
          onChange={(e) => handleChange({ list_type: e.target.value as ListType })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold/50 disabled:opacity-50"
        >
          {(Object.keys(LIST_TYPE_LABELS) as ListType[]).map((key) => (
            <option key={key} value={key}>
              {LIST_TYPE_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted">چه کسانی می‌توانند آیتم اضافه کنند</label>
        <select
          value={contributionMode}
          disabled={saving}
          onChange={(e) => handleChange({ contribution_mode: e.target.value as ListContributionMode })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold/50 disabled:opacity-50"
        >
          {(Object.keys(CONTRIBUTION_MODE_LABELS) as ListContributionMode[]).map((key) => (
            <option key={key} value={key}>
              {CONTRIBUTION_MODE_LABELS[key]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          محدود کردن این گزینه آیتم‌های قبلاً اضافه‌شده را حذف نمی‌کند، فقط جلوی افزودن‌های جدید را می‌گیرد.
        </p>
      </div>

      {error && <p className="mt-2 text-sm text-gold">{error}</p>}
    </div>
  );
}

export { CONTRIBUTION_MODE_LABELS };
