"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { EntityManager } from "../entity-manager/EntityManager";
import { RelationsManager } from "../relations/RelationsManager";
import { AdminEntitiesManager } from "./AdminEntitiesManager";

const TABS = [
  { key: "all", label: "همهٔ موجودیت‌ها", hint: "جستجو، ساخت، ویرایش، حذف و جوایز همهٔ انواع (فیلم، سریال، هنرمند، ژانر و …)." },
  { key: "overview", label: "خلاصه و تریلر", hint: "خلاصهٔ فارسی دستی و تریلر آپارات برای فیلم‌ها و سریال‌ها. متن دستی با sync و ترجمهٔ ماشینی بازنویسی نمی‌شود." },
  { key: "relations", label: "روابط", hint: "کارگردان، بازیگر، سازنده و ژانر هر موجودیت را ببینید، اضافه یا حذف کنید." },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function EntitiesTabs() {
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  // ?q= (the SEO page's fix list) opens the overview tab on that title.
  const initial: Tab = TABS.some((t) => t.key === fromUrl) ? (fromUrl as Tab) : params.get("q") ? "overview" : "all";
  const [tab, setTab] = useState<Tab>(initial);
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm transition ${tab === t.key ? "bg-gold font-medium text-bg" : "border border-border text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{current.hint}</p>
      {tab === "all" && <EntityManager />}
      {tab === "overview" && <AdminEntitiesManager />}
      {tab === "relations" && <RelationsManager />}
    </div>
  );
}
