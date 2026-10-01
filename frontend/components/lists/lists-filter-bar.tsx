import Link from "next/link";

export type ListSort = "newest" | "popular";
export type ListTypeFilter = "all" | "movie" | "tv_series" | "person" | "actor" | "director";

export const SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "newest", label: "تازه‌ترین" },
  { value: "popular", label: "محبوب‌ترین" },
];

// "actor"/"director" are backend pseudo-types over person lists
// (see ListRepository.discover).
export const TYPE_OPTIONS: { value: ListTypeFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "movie", label: "فیلم" },
  { value: "tv_series", label: "سریال" },
  { value: "actor", label: "بازیگر" },
  { value: "director", label: "کارگردان" },
];

export function parseSort(v: string | undefined): ListSort {
  return v === "popular" ? "popular" : "newest";
}

export function parseType(v: string | undefined): ListTypeFilter {
  return TYPE_OPTIONS.some((o) => o.value === v) ? (v as ListTypeFilter) : "all";
}

function href(sort: ListSort, type: ListTypeFilter) {
  const qs = new URLSearchParams();
  if (sort !== "newest") qs.set("sort", sort);
  if (type !== "all") qs.set("type", type);
  const s = qs.toString();
  return s ? `/lists?${s}` : "/lists";
}

const chip = "inline-flex min-h-[44px] items-center rounded-full border px-5 text-sm transition";
const chipIdle = "border-[#232A42] text-[#8A93A6] hover:text-[#F2F0E8]";
const chipActive = "border-[#E8B34A] bg-[#E8B34A]/[.12] font-bold text-[#E8B34A]";

export default function ListsFilterBar({ sort, type }: { sort: ListSort; type: ListTypeFilter }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:gap-10">
      <Group label="SORT">
        {SORT_OPTIONS.map((o) => (
          <Link key={o.value} href={href(o.value, type)} aria-current={sort === o.value} className={`${chip} ${sort === o.value ? chipActive : chipIdle}`}>
            {o.label}
          </Link>
        ))}
      </Group>
      <Group label="TYPE">
        {TYPE_OPTIONS.map((o) => (
          <Link key={o.value} href={href(sort, o.value)} aria-current={type === o.value} className={`${chip} ${type === o.value ? chipActive : chipIdle}`}>
            {o.label}
          </Link>
        ))}
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span dir="ltr" className="ml-1 font-mono text-[11px] uppercase tracking-[.3em] text-[#5A6380]">{label}</span>
      {children}
    </div>
  );
}
