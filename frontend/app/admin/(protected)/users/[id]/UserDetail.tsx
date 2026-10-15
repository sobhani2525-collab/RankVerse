"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { adminUsersCall, type AdminUserDetail } from "@/lib/admin-users";
import { fullDate, shortDate } from "@/lib/admin-format";
import { relativeTimeFa } from "@/lib/relative-time";
import { ConfirmDialog } from "../../_components/ConfirmDialog";
import { StatusBadge } from "../../_components/StatusBadge";
import { ToastProvider, useToast } from "../../_components/Toast";
import { UserAvatar } from "../../_components/UserAvatar";
import { ActivityTab } from "./ActivityTab";
import { AuditTab } from "./AuditTab";
import { EditTab } from "./EditTab";
import { NoteTab } from "./NoteTab";
import { OverviewTab } from "./OverviewTab";

const TABS = [
  { key: "overview", label: "نمای کلی" },
  { key: "edit", label: "ویرایش" },
  { key: "activity", label: "فعالیت جامعه" },
  { key: "note", label: "یادداشت داخلی" },
  { key: "audit", label: "تاریخچهٔ مدیریتی" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type DialogKind = "block" | "delete" | "reset" | "verify";

export function UserDetail({ id }: { id: string }) {
  return (
    <ToastProvider>
      <Detail id={id} />
    </ToastProvider>
  );
}

function Detail({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false); // set by the edit / note tabs while they hold unsaved changes

  const tab: TabKey = TABS.some((t) => t.key === searchParams.get("tab")) ? (searchParams.get("tab") as TabKey) : "overview";
  const back = searchParams.get("back");
  const backHref = `/admin/users${back ? `?${back}` : ""}`;

  const load = useCallback(async () => {
    try {
      setUser((await adminUsersCall<AdminUserDetail>(`/${id}`)).data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطا در دریافت کاربر";
      setError({ message, notFound: /not found/i.test(message) });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Browser-level guard (reload / close tab) while a form has unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const leaveOk = () => !dirty.current || window.confirm("تغییرات ذخیره‌نشده از بین می‌رود. ادامه می‌دهید؟");

  function goTab(next: TabKey) {
    if (next === tab || !leaveOk()) return;
    dirty.current = false;
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", next);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  async function act(path: string, method: string, body: unknown, success: string) {
    setBusy(true);
    try {
      await adminUsersCall(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      toast({ text: success });
      setDialog(null);
      await load();
    } catch (err) {
      toast({ ok: false, text: err instanceof Error ? err.message : "انجام نشد" });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={backHref} className="text-sm text-muted hover:text-gold">← بازگشت به لیست</Link>
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-8 text-center text-sm text-red-300">
          <p className="text-base font-bold">{error.notFound ? "کاربر پیدا نشد." : error.message}</p>
          {!error.notFound && (
            <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-red-400/50 px-4 py-1.5 font-bold hover:bg-red-500/10">
              تلاش مجدد
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-5 w-32 animate-pulse rounded bg-surface2" />
        <div className="h-28 animate-pulse rounded-xl bg-surface2" />
        <div className="h-64 animate-pulse rounded-xl bg-surface2" />
      </div>
    );
  }

  const name = user.display_name || user.username;
  const deleted = user.status === "deleted";
  const btn = "rounded-lg border px-3 py-1.5 text-sm font-bold transition disabled:opacity-40";

  return (
    <div className="space-y-5">
      <Link
        href={backHref}
        onClick={(e) => {
          if (!leaveOk()) e.preventDefault();
        }}
        className="inline-block text-sm text-muted hover:text-gold"
      >
        ← بازگشت به لیست
      </Link>

      <header className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start gap-4">
          <UserAvatar avatarKey={user.avatar_key} name={name} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-ink">{name}</h1>
              <StatusBadge status={user.status} />
            </div>
            <p dir="ltr" className="mt-1 text-start text-sm text-muted">@{user.username}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span dir="ltr" className="text-sm text-ink">{user.email}</span>
              <CopyButton text={user.email} />
              <span className={`text-xs ${user.email_verified ? "text-teal" : "text-muted"}`}>
                {user.email_verified ? "ایمیل تأیید شده" : "ایمیل تأیید نشده"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              <span title={fullDate(user.created_at)}>عضویت: {shortDate(user.created_at)}</span>
              {" · "}
              <span title={user.last_login_at ? fullDate(user.last_login_at) : undefined}>
                آخرین ورود: {user.last_login_at ? relativeTimeFa(user.last_login_at) : "هرگز وارد نشده"}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!deleted && (
            <button type="button" onClick={() => goTab("edit")} className={`${btn} border-border text-ink hover:border-gold/40`}>ویرایش</button>
          )}
          {!deleted &&
            (user.status === "blocked" ? (
              <button type="button" disabled={busy} onClick={() => void act(`/${id}/unblock`, "POST", undefined, "مسدودیت برداشته شد")} className={`${btn} border-teal/40 text-teal hover:bg-teal/10`}>رفع مسدودیت</button>
            ) : (
              <button type="button" onClick={() => setDialog("block")} className={`${btn} border-gold/40 text-gold hover:bg-gold/10`}>مسدود کردن</button>
            ))}
          {!deleted && (
            <button type="button" onClick={() => setDialog("reset")} className={`${btn} border-border text-ink hover:border-gold/40`}>ارسال لینک بازیابی رمز</button>
          )}
          {!deleted && !user.email_verified && (
            <button type="button" onClick={() => setDialog("verify")} className={`${btn} border-border text-ink hover:border-teal/40`}>تأیید دستی ایمیل</button>
          )}
          {deleted ? (
            <button type="button" disabled={busy} onClick={() => void act(`/${id}/restore`, "POST", undefined, "کاربر بازیابی شد")} className={`${btn} border-teal/40 text-teal hover:bg-teal/10`}>بازیابی کاربر</button>
          ) : (
            <button type="button" onClick={() => setDialog("delete")} className={`${btn} border-red-500/40 text-red-400 hover:bg-red-500/10`}>حذف کاربر</button>
          )}
        </div>
      </header>

      {user.status === "blocked" && (
        <div role="alert" className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold">
          <p className="font-bold">این کاربر مسدود است.</p>
          <p className="mt-1 text-gold/90">
            دلیل: {user.blocked_reason || "—"}
            {user.blocked_at && <span title={fullDate(user.blocked_at)}> · {relativeTimeFa(user.blocked_at)}</span>}
            {user.blocked_by_admin_email && <> · توسط <bdi>{user.blocked_by_admin_email}</bdi></>}
          </p>
        </div>
      )}
      {deleted && user.deleted_at && (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          این کاربر <span title={fullDate(user.deleted_at)}>{relativeTimeFa(user.deleted_at)}</span> حذف شده است (قابل بازیابی).
        </div>
      )}

      <div role="tablist" aria-label="بخش‌های کاربر" className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => goTab(t.key)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              tab === t.key ? "border-gold/50 bg-gold/15 font-bold text-gold" : "border-border text-muted hover:border-gold/30 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "overview" && <OverviewTab user={user} />}
        {tab === "edit" && <EditTab user={user} onSaved={load} dirtyRef={dirty} />}
        {tab === "activity" && <ActivityTab userId={id} />}
        {tab === "note" && <NoteTab user={user} onSaved={load} dirtyRef={dirty} />}
        {tab === "audit" && <AuditTab userId={id} reloadKey={user.status + String(user.email_verified)} />}
      </div>

      {dialog === "block" && (
        <ConfirmDialog
          title={`مسدود کردن «${name}»`}
          description="کاربر مسدود نمی‌تواند وارد شود و نشست‌های فعلی‌اش بسته می‌شود. فهرست‌ها و رای‌هایش حذف نمی‌شود."
          confirmLabel="مسدود کردن"
          danger
          busy={busy}
          reason={{ label: "دلیل مسدودسازی (الزامی)" }}
          onCancel={() => !busy && setDialog(null)}
          onConfirm={(reason) => void act(`/${id}/block`, "POST", { reason }, "کاربر مسدود شد")}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title={`حذف «${name}»`}
          description="حذف نرم است: حساب از سایت پنهان می‌شود و ورود ممکن نیست، اما داده‌ها می‌مانند و قابل بازیابی است."
          confirmLabel="حذف کاربر"
          danger
          busy={busy}
          requireText={user.username}
          onCancel={() => !busy && setDialog(null)}
          onConfirm={() => void act(`/${id}`, "DELETE", undefined, "کاربر حذف شد")}
        />
      )}
      {dialog === "reset" && (
        <ConfirmDialog
          title="ارسال لینک بازیابی رمز"
          description={<>لینک بازیابی به <bdi>{user.email}</bdi> ایمیل می‌شود.</>}
          confirmLabel="ارسال"
          busy={busy}
          onCancel={() => !busy && setDialog(null)}
          onConfirm={() => void act(`/${id}/send-password-reset`, "POST", undefined, "لینک بازیابی ارسال شد")}
        />
      )}
      {dialog === "verify" && (
        <ConfirmDialog
          title="تأیید دستی ایمیل"
          description={<>ایمیل <bdi>{user.email}</bdi> بدون ارسال لینک تأیید، تأییدشده ثبت می‌شود.</>}
          confirmLabel="تأیید ایمیل"
          busy={busy}
          onCancel={() => !busy && setDialog(null)}
          onConfirm={() => void act(`/${id}/verify-email`, "POST", undefined, "ایمیل تأیید شد")}
        />
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="کپی ایمیل"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
      className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-gold/40 hover:text-gold"
    >
      {copied ? "کپی شد" : "کپی"}
    </button>
  );
}
