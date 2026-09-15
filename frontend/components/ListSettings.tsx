"use client";
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
  listType,
  contributionMode,
  onListTypeChange,
  onContributionModeChange,
}: {
  listType: ListType;
  contributionMode: ListContributionMode;
  onListTypeChange: (value: ListType) => void;
  onContributionModeChange: (value: ListContributionMode) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4">
      <p className="mb-3 text-sm font-medium text-ink">تنظیمات لیست</p>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted">نوع ترتیب‌بندی</label>
        <select
          value={listType}
          onChange={(e) => onListTypeChange(e.target.value as ListType)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
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
          onChange={(e) => onContributionModeChange(e.target.value as ListContributionMode)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
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
    </div>
  );
}

export { CONTRIBUTION_MODE_LABELS };
