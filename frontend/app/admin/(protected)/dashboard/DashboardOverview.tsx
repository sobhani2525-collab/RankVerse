"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AdminDashboardStats } from "@/lib/admin-dashboard";
import { adminApiCall } from "@/lib/admin-users";
import { fullDate } from "@/lib/admin-format";
import { toFaDigits } from "@/lib/format-number";
import { relativeTimeFa } from "@/lib/relative-time";
import { StatCard } from "../_components/StatCard";
import { TrendBars } from "../_components/TrendBars";

const fa = (n: number) => toFaDigits(n.toLocaleString("en-US"));

type Tone = "ok" | "warn" | "critical";
const TONE: Record<Tone, { box: string; icon: string }> = {
  ok: { box: "border-border text-ink", icon: "✓" },
  warn: { box: "border-gold/40 bg-gold/10 text-gold", icon: "!" },
  critical: { box: "border-red-400/40 bg-red-400/10 text-red-300", icon: "⚠" },
};

function AttentionItem({ href, tone, children }: { href: string; tone: Tone; children: React.ReactNode }) {
  return (
    <Link href={href} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition hover:border-gold/50 ${TONE[tone].box}`}>
      <span aria-hidden className="font-bold">{TONE[tone].icon}</span>
      {children}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-sm font-bold text-ink-dim">{title}</h2>
      {children}
    </section>
  );
}

export function DashboardOverview() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setStats((await adminApiCall<AdminDashboardStats>("dashboard", "/stats")).data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !stats) {
    return (
      <p className="mt-8 text-sm text-muted">
        خطا در دریافت آمار.{" "}
        <button onClick={load} className="text-teal">
          تلاش مجدد
        </button>
      </p>
    );
  }

  const s = stats;
  const inbox = s?.inbox;
  const daily = s?.daily_battle;

  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {s ? (
            <>
              به‌روزرسانی <span title={fullDate(s.generated_at)}>{relativeTimeFa(s.generated_at)}</span> · اعداد تا یک دقیقه کش می‌شوند
            </>
          ) : (
            "در حال بارگذاری…"
          )}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50 disabled:opacity-50"
        >
          {loading ? "در حال دریافت…" : "تازه‌سازی"}
        </button>
      </div>

      {inbox && daily && (
        <Section title="نیازمند توجه">
          <div className="flex flex-wrap gap-3">
            <AttentionItem href="/admin/messages" tone={inbox.new_messages ? "warn" : "ok"}>
              {inbox.new_messages ? (
                <>
                  <b className="num">{fa(inbox.new_messages)}</b> پیام خوانده‌نشده
                </>
              ) : (
                "پیام خوانده‌نشده‌ای نیست"
              )}
            </AttentionItem>
            <AttentionItem href="/admin/alerts" tone={inbox.critical_alerts ? "critical" : inbox.open_alerts ? "warn" : "ok"}>
              {inbox.open_alerts ? (
                <>
                  <b className="num">{fa(inbox.open_alerts)}</b> هشدار باز
                  {inbox.critical_alerts > 0 && (
                    <>
                      {" "}
                      (<b className="num">{fa(inbox.critical_alerts)}</b> بحرانی)
                    </>
                  )}
                </>
              ) : (
                "هشدار بازی نیست"
              )}
            </AttentionItem>
            <AttentionItem href="/admin/daily-battles" tone={daily.scheduled_today ? "ok" : "warn"}>
              {daily.scheduled_today ? (
                <>
                  نبرد امروز: <b className="num">{fa(daily.votes_today)}</b> رأی
                </>
              ) : (
                "نبرد امروز هنوز ساخته نشده"
              )}
            </AttentionItem>
          </div>
        </Section>
      )}

      <Section title="کاربران">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="کل کاربران" value={s?.users.total ?? null} href="/admin/users" />
          <StatCard label="ثبت‌نام ۷ روز اخیر" value={s?.users.new_7d ?? null} change={s?.users.new_7d_change_pct} />
          <StatCard label="فعال امروز" value={s?.users.active_today ?? null} />
          <StatCard label="فعال ۷ روز اخیر" value={s?.users.active_7d ?? null} />
        </div>
      </Section>

      <Section title="تعامل در ۷ روز اخیر">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <StatCard label="رأی‌ها (نبردها و نبرد روز)" value={s?.votes.last_7d ?? null} change={s?.votes.change_pct} hint={s ? `کل: ${fa(s.votes.total)}` : undefined} />
          <StatCard label="امتیازها" value={s?.ratings.last_7d ?? null} change={s?.ratings.change_pct} hint={s ? `کل: ${fa(s.ratings.total)}` : undefined} />
          <StatCard label="نظرها" value={s?.comments.last_7d ?? null} change={s?.comments.change_pct} hint={s ? `کل: ${fa(s.comments.total)}` : undefined} />
        </div>
      </Section>

      <Section title="محتوا">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="فیلم‌ها" value={s?.catalog.movies ?? null} href="/admin/entities" />
          <StatCard label="سریال‌ها" value={s?.catalog.tv_series ?? null} href="/admin/entities" />
          <StatCard label="افراد" value={s?.catalog.people ?? null} />
          <StatCard
            label="فهرست‌ها"
            value={s?.lists.total ?? null}
            href="/admin/lists"
            hint={s ? `عمومی: ${fa(s.lists.public)} · جدید هفته: ${fa(s.lists.new_7d)}` : undefined}
          />
          <StatCard
            label="نبردها"
            value={s?.battles.total ?? null}
            href="/admin/battles"
            hint={s ? `فعال: ${fa(s.battles.active)} · جدید هفته: ${fa(s.battles.new_7d)}` : undefined}
          />
        </div>
      </Section>

      {s && (
        <Section title="روند ۳۰ روز اخیر">
          <div className="grid gap-3 md:grid-cols-2">
            <TrendBars title="ثبت‌نام" unit="ثبت‌نام" totalLabel="مجموع ۳۰ روز" days={s.days} pick={(d) => d.signups} />
            <TrendBars title="رأی‌ها" unit="رأی" totalLabel="مجموع ۳۰ روز" days={s.days} pick={(d) => d.votes} />
            <TrendBars title="امتیازها" unit="امتیاز" totalLabel="مجموع ۳۰ روز" days={s.days} pick={(d) => d.ratings} />
            <TrendBars title="نظرها" unit="نظر" totalLabel="مجموع ۳۰ روز" days={s.days} pick={(d) => d.comments} />
          </div>
        </Section>
      )}
    </div>
  );
}
