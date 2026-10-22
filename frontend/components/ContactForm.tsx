"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ContactCategory, sendContactMessage } from "@/lib/api";

const TOPICS: { value: ContactCategory; label: string; hint: string }[] = [
  { value: "bug", label: "گزارش خطا", hint: "صفحه‌ای باز نمی‌شود، دکمه‌ای کار نمی‌کند یا چیزی درست نمایش داده نمی‌شود." },
  { value: "inappropriate", label: "محتوای نامناسب", hint: "فهرست، نبرد، نظر یا پروفایلی که توهین‌آمیز، اسپم یا نامناسب است." },
  { value: "content_error", label: "اطلاعات نادرست", hint: "عنوان، پوستر، خلاصه، بازیگران یا لینک تماشای یک فیلم یا سریال اشتباه است." },
  { value: "suggestion", label: "پیشنهاد و انتقاد", hint: "ایده‌ای برای بهتر شدن سایت یا قابلیتی که دوست داری اضافه شود." },
  { value: "copyright", label: "حق نشر", hint: "صاحب اثر هستی و دربارهٔ محتوایی در سایت درخواستی داری." },
  { value: "other", label: "سایر موارد", hint: "همکاری، رسانه یا هر موضوع دیگری." },
];

const field =
  "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-dim focus:border-gold/50";

// Only same-site paths are kept from ?page=, so a crafted link can't plant an outside URL.
function initialPage(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw.slice(0, 500) : "";
}

export default function ContactForm() {
  const params = useSearchParams();
  const { user, isAuthenticated, getToken } = useAuth();
  const preset = params.get("topic");
  const [category, setCategory] = useState<ContactCategory>(
    TOPICS.some((t) => t.value === preset) ? (preset as ContactCategory) : "bug"
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pageUrl, setPageUrl] = useState(() => initialPage(params.get("page")));
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const topic = TOPICS.find((t) => t.value === category)!;
  const needsPage = category === "bug" || category === "inappropriate" || category === "content_error";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 3) return setError("یک عنوان کوتاه برای پیامت بنویس.");
    if (message.trim().length < 10) return setError("متن پیام کمی کوتاه است؛ کمی بیشتر توضیح بده.");
    setSending(true);
    try {
      await sendContactMessage(
        { category, subject: subject.trim(), message: message.trim(), name, email, page_url: pageUrl.trim(), website },
        isAuthenticated ? getToken() : null
      );
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال پیام ممکن نشد. دوباره امتحان کن.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-10 rounded-3xl border border-teal/30 bg-teal/5 px-6 py-12 text-center">
        <p className="font-display text-2xl text-ink">پیامت رسید. ممنون!</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted">
          تیم سینماگزین پیام را بررسی می‌کند{email || user?.email ? " و در صورت نیاز از طریق ایمیل با تو در تماس خواهد بود" : ""}.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary text-sm hover:opacity-90">
            بازگشت به صفحهٔ اصلی
          </Link>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setSubject("");
              setMessage("");
            }}
            className="btn-secondary text-sm hover:border-gold/40 hover:text-gold"
          >
            ارسال پیام دیگر
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-8" noValidate>
      <fieldset>
        <legend className="text-sm font-bold text-ink">موضوع پیام</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TOPICS.map((t) => (
            <label
              key={t.value}
              className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-sm transition ${
                category === t.value ? "border-gold/60 bg-gold/10 font-bold text-gold" : "border-border text-muted hover:border-gold/30 hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="category"
                value={t.value}
                checked={category === t.value}
                onChange={() => setCategory(t.value)}
                className="sr-only"
              />
              {t.label}
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs leading-6 text-muted">{topic.hint}</p>
      </fieldset>

      <div className="space-y-4">
        <div>
          <label htmlFor="contact-subject" className="mb-1.5 block text-sm text-muted">
            عنوان
          </label>
          <input id="contact-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required className={field} />
        </div>

        {needsPage && (
          <div>
            <label htmlFor="contact-page" className="mb-1.5 block text-sm text-muted">
              لینک صفحه <span className="text-dim">(اختیاری)</span>
            </label>
            <input
              id="contact-page"
              dir="ltr"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              maxLength={500}
              placeholder="https://cinemagozin.ir/..."
              className={`${field} text-left`}
            />
          </div>
        )}

        <div>
          <label htmlFor="contact-message" className="mb-1.5 block text-sm text-muted">
            متن پیام
          </label>
          <textarea
            id="contact-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            rows={7}
            required
            className={`${field} resize-y leading-7`}
          />
          <p className="mt-1 text-left text-[11px] text-dim">{message.length.toLocaleString("fa-IR")} / ۴٬۰۰۰</p>
        </div>

        {isAuthenticated ? (
          <p className="rounded-xl border border-border/60 bg-white/[0.02] px-4 py-3 text-xs leading-6 text-muted">
            پیام با حساب <span className="font-bold text-ink">{user?.username}</span> فرستاده می‌شود و پاسخ احتمالی به ایمیل همین حساب
            می‌رسد.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-name" className="mb-1.5 block text-sm text-muted">
                نام <span className="text-dim">(اختیاری)</span>
              </label>
              <input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={field} />
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-1.5 block text-sm text-muted">
                ایمیل برای پاسخ <span className="text-dim">(اختیاری)</span>
              </label>
              <input
                id="contact-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={320}
                className={`${field} text-left`}
              />
            </div>
          </div>
        )}

        {/* Honeypot: invisible and skipped by keyboard and screen readers; only bots fill it. */}
        <div aria-hidden="true" className="sr-only">
          <label htmlFor="contact-website">وب‌سایت</label>
          <input id="contact-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-2.5 text-sm text-gold">
          {error}
        </p>
      )}

      <button type="submit" disabled={sending} className="btn-primary w-full justify-center text-sm hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-10">
        {sending ? "در حال ارسال…" : "ارسال پیام"}
      </button>
    </form>
  );
}
