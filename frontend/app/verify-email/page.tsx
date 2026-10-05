"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyEmail } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function VerifyEmailPage() {
  // useSearchParams needs a Suspense boundary -- only the inner component reads it.
  return (
    <Suspense fallback={<div className="mx-auto max-w-sm px-6 py-14 text-center text-muted">در حال بارگذاری…</div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}

type State = { status: "working" } | { status: "ok" } | { status: "error"; message: string };

function VerifyEmailInner() {
  const token = useSearchParams().get("token") || "";
  const { refreshUser } = useAuth();
  const [state, setState] = useState<State>(token ? { status: "working" } : { status: "error", message: "لینک تأیید نامعتبر است." });
  // Strict Mode runs effects twice in dev; the token is single-purpose, so call once.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then(async () => {
        setState({ status: "ok" });
        await refreshUser();
      })
      .catch((err) => setState({ status: "error", message: err instanceof Error ? err.message : "تأیید ایمیل ممکن نشد." }));
  }, [token, refreshUser]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-6 py-14 text-center">
      {state.status === "working" && <p className="text-muted">در حال تأیید ایمیل…</p>}

      {state.status === "ok" && (
        <>
          <h1 className="text-2xl font-bold text-ink">ایمیل شما تأیید شد</h1>
          <p className="mt-2 text-sm text-muted">ممنون! حالا می‌توانید از همهٔ امکانات سینماگزین استفاده کنید.</p>
          <Link href="/" className="mt-8 rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90">
            رفتن به صفحهٔ اصلی
          </Link>
        </>
      )}

      {state.status === "error" && (
        <>
          <h1 className="text-2xl font-bold text-ink">تأیید ناموفق بود</h1>
          <p role="alert" className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
            {state.message}
          </p>
          <p className="mt-4 text-sm text-muted">اگر وارد حساب‌تان شده‌اید، از نوار بالای صفحه لینک جدید بخواهید.</p>
          <Link href="/" className="mt-6 text-sm text-teal hover:underline">
            بازگشت به صفحهٔ اصلی
          </Link>
        </>
      )}
    </main>
  );
}
