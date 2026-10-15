"use client";
import { useEffect, useState } from "react";
import { adminUsersCall, type AdminUserDetail } from "@/lib/admin-users";
import { fullDate } from "@/lib/admin-format";
import { toFaDigits } from "@/lib/format-number";
import { relativeTimeFa } from "@/lib/relative-time";
import { activityHref, activityTitle, type ActivityKind, type ActivityRow } from "./activity";

const VERB: Record<ActivityKind, string> = {
  ratings: "رتبه داد به",
  favorites: "به علاقه‌مندی‌ها افزود",
  lists: "فهرست ساخت:",
  comments: "کامنت گذاشت روی",
};

interface TimelineItem {
  kind: ActivityKind;
  row: ActivityRow;
}

export function OverviewTab({ user }: { user: AdminUserDetail }) {
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const kinds: ActivityKind[] = ["ratings", "favorites", "lists", "comments"];
    Promise.all(kinds.map((k) => adminUsersCall<ActivityRow[]>(`/${user.id}/activity?kind=${k}&page_size=5`).then((r) => r.data.map((row) => ({ kind: k, row })))))
      .then((groups) => {
        if (cancelled) return;
        const all = groups.flat().sort((a, b) => b.row.created_at.localeCompare(a.row.created_at));
        setTimeline(all.slice(0, 8));
      })
      .catch(() => !cancelled && setTimeline([]));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const stats = [
    { label: "رتبه‌ها", value: user.ratings_count },
    { label: "علاقه‌مندی‌ها", value: user.favorites_count },
    { label: "فهرست‌ها", value: user.lists_count },
    { label: "کامنت‌ها", value: user.comments_count },
    { label: "رای‌های نبرد", value: user.battle_votes_count },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="num mt-1 text-2xl font-bold text-ink">{toFaDigits(s.value)}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">دربارهٔ کاربر</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted">{user.bio || "بیوگرافی ثبت نشده است."}</p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">آخرین فعالیت‌ها</h2>
        {timeline === null ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-6 animate-pulse rounded bg-surface2" />)}
          </div>
        ) : timeline.length === 0 ? (
          <p className="mt-3 text-sm text-muted">فعالیتی ثبت نشده است.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-s border-border ps-4">
            {timeline.map(({ kind, row }) => {
              const href = activityHref(kind, row);
              const title = activityTitle(kind, row);
              return (
                <li key={`${kind}-${row.id}`} className="relative text-sm text-muted">
                  <span aria-hidden className="absolute -start-[21px] top-2 h-2 w-2 rounded-full bg-teal" />
                  {VERB[kind]}{" "}
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-ink hover:text-teal">{title}</a>
                  ) : (
                    <span className="font-bold text-ink">{title}</span>
                  )}
                  {kind === "ratings" && <span className="num text-gold"> ({toFaDigits(row.score ?? 0)}/۵)</span>}
                  <span className="ms-2 text-xs" title={fullDate(row.created_at)}>{relativeTimeFa(row.created_at)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
