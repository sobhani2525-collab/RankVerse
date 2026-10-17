"use client";
import { useCallback, useEffect, useState } from "react";
import { adminApiCall } from "@/lib/admin-users";
import { relativeTimeFa } from "@/lib/relative-time";
import { ToastProvider, useToast } from "../_components/Toast";

interface AdminAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  source: string;
  title: string;
  details: Record<string, unknown>;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
}

const SEVERITY_LABELS: Record<string, string> = { critical: "بحرانی", warning: "هشدار", info: "اطلاع" };
const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400",
  warning: "bg-gold/10 text-gold",
  info: "bg-teal/10 text-teal",
};
const STATUS_OPTIONS = [
  { value: "open", label: "باز" },
  { value: "unacknowledged", label: "بدون تأیید" },
  { value: "resolved", label: "حل‌شده" },
  { value: "all", label: "همه" },
];
const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";
const faNumber = (n: number) => n.toLocaleString("fa-IR");

export function AlertsManager() {
  return (
    <ToastProvider>
      <Manager />
    </ToastProvider>
  );
}

function Manager() {
  const toast = useToast();
  const [rows, setRows] = useState<AdminAlert[]>([]);
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams({ status });
      if (severity) qs.set("severity", severity);
      const res = await adminApiCall<AdminAlert[]>("alerts", `?${qs.toString()}`);
      setRows(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [severity, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(row: AdminAlert, action: "acknowledge" | "resolve") {
    try {
      await adminApiCall("alerts", `/${row.id}/${action}`, { method: "POST" });
      toast({ text: action === "resolve" ? "هشدار حل‌شده علامت خورد" : "هشدار تأیید شد", ok: true });
      await load();
      window.dispatchEvent(new Event("admin-alerts-changed"));
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "خطا", ok: false });
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={field} aria-label="وضعیت">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={field} aria-label="شدت">
          <option value="">همهٔ شدت‌ها</option>
          {Object.entries(SEVERITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button onClick={load} className="rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50">
          تازه‌سازی
        </button>
      </div>

      {error ? (
        <p className="mt-8 text-sm text-muted">
          خطا در دریافت هشدارها.{" "}
          <button onClick={load} className="text-teal">
            تلاش مجدد
          </button>
        </p>
      ) : loading && rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted">در حال بارگذاری…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted">هشداری وجود ندارد.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${SEVERITY_TONE[a.severity]}`}>
                      {SEVERITY_LABELS[a.severity]}
                    </span>
                    <span className="text-xs text-muted" dir="ltr">{a.source}</span>
                    {a.resolved_at && <span className="text-xs text-teal">حل‌شده</span>}
                    {!a.resolved_at && a.acknowledged_at && <span className="text-xs text-muted">تأییدشده</span>}
                  </div>
                  <p className="mt-2 text-sm font-bold text-ink">{a.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {faNumber(a.occurrences)} بار · آخرین بار {relativeTimeFa(a.last_seen_at)} · اولین بار {relativeTimeFa(a.first_seen_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm">
                  <button onClick={() => setExpanded(expanded === a.id ? null : a.id)} className="text-muted transition hover:text-teal">
                    جزئیات
                  </button>
                  {!a.acknowledged_at && !a.resolved_at && (
                    <button onClick={() => act(a, "acknowledge")} className="rounded-lg border border-border px-3 py-1.5 text-ink transition hover:border-gold/50">
                      تأیید
                    </button>
                  )}
                  {!a.resolved_at && (
                    <button onClick={() => act(a, "resolve")} className="rounded-lg border border-teal/40 px-3 py-1.5 text-teal transition hover:bg-teal/10">
                      حل شد
                    </button>
                  )}
                </div>
              </div>
              {expanded === a.id && (
                <pre dir="ltr" className="mt-3 overflow-x-auto rounded-lg bg-bg p-3 text-xs text-muted">
                  {JSON.stringify(a.details, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
