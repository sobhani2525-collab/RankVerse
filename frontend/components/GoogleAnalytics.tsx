"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { analyticsPath, campaignQuery, consentKey, syncAnalytics } from "@/lib/ga4";

type Consent = "accepted" | "declined" | null;

export default function GoogleAnalytics() {
  const path = usePathname();
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const campaign = useRef("");

  useEffect(() => {
    if (navigator.doNotTrack === "1") return;
    if (analyticsPath(location.pathname)) campaign.current = campaignQuery(location.search);
    function update(value: string | null) {
      setConsent(value === "accepted" || value === "declined" ? value : null);
    }
    try { update(localStorage.getItem(consentKey)); } catch { /* Session-only choice. */ }
    setReady(true);
    function onStorage(event: StorageEvent) {
      if (event.key === consentKey || event.key === null) {
        if (event.newValue !== "accepted") campaign.current = "";
        update(event.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (ready && path) syncAnalytics(consent === "accepted", path, campaign.current);
  }, [consent, path, ready]);

  function choose(value: Exclude<Consent, null>) {
    if (value === "declined") campaign.current = "";
    if (path) syncAnalytics(value === "accepted", path, campaign.current);
    setConsent(value);
    setEditing(false);
    try { localStorage.setItem(consentKey, value); } catch { /* Session-only choice. */ }
  }

  if (!ready || !path || !analyticsPath(path)) return null;

  if (consent && !editing) {
    return <div className="mx-auto max-w-7xl px-4 pb-4 text-center">
      <button type="button" className="text-sm text-ink-dim underline" onClick={() => setEditing(true)}>
        تنظیمات آمار بازدید
      </button>
    </div>;
  }

  return (
    <aside aria-label="آمار بازدید" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-xl border border-border bg-surface2 p-4 text-sm text-ink shadow-xl">
      <p>با اجازهٔ تو، از گوگل آنالیتیکس برای سنجش بازدید و استفاده از امکانات سایت استفاده می‌کنیم. <Link href="/privacy" className="underline">حریم خصوصی</Link></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-border px-4 py-2" onClick={() => choose("declined")}>رد آمار بازدید</button>
        <button type="button" className="rounded-lg bg-gold px-4 py-2 font-bold text-bg" onClick={() => choose("accepted")}>پذیرش آمار بازدید</button>
      </div>
    </aside>
  );
}
