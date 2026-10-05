"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { resendVerificationEmail } from "@/lib/api";

type State = { status: "idle" } | { status: "sending" } | { status: "sent"; devLink?: string } | { status: "error"; message: string };

/**
 * Thin strip under the header for signed-in users whose email isn't confirmed
 * yet. Informational only: nothing on the site is blocked on it.
 */
export default function EmailVerifyBanner() {
  const { user, getToken } = useAuth();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ status: "idle" });

  if (!user || user.email_verified !== false) return null;
  // The admin panel and the confirmation page itself don't need the nudge.
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/verify-email")) return null;

  async function resend() {
    const token = getToken();
    if (!token) return;
    setState({ status: "sending" });
    try {
      const res = await resendVerificationEmail(token);
      setState({ status: "sent", devLink: res.dev_verify_link });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "ارسال ایمیل ممکن نشد" });
    }
  }

  return (
    <div role="status" className="border-b border-gold/20 bg-gold/5 px-4 py-2 text-center text-xs text-gold sm:text-sm">
      {state.status === "sent" ? (
        <>
          لینک تأیید به <span dir="ltr">{user.email}</span> ارسال شد. پوشهٔ اسپم را هم نگاه کنید.
          {state.devLink && (
            <a href={state.devLink} className="mr-2 underline">
              (لینک محلی)
            </a>
          )}
        </>
      ) : (
        <>
          ایمیل <span dir="ltr">{user.email}</span> هنوز تأیید نشده است.{" "}
          <button type="button" onClick={resend} disabled={state.status === "sending"} className="underline hover:text-ink disabled:opacity-60">
            {state.status === "sending" ? "در حال ارسال…" : "ارسال دوبارهٔ لینک تأیید"}
          </button>
          {state.status === "error" && <span className="mr-2 text-ink-dim">{state.message}</span>}
        </>
      )}
    </div>
  );
}
