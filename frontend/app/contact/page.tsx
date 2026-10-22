import type { Metadata } from "next";
import { Suspense } from "react";
import ContactForm from "@/components/ContactForm";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

const TITLE = "ارتباط با ما";
const DESCRIPTION =
  "گزارش خطا، گزارش محتوای نامناسب، اصلاح اطلاعات فیلم‌ها و سریال‌ها یا هر پیشنهادی برای بهتر شدن سینماگزین را برای ما بفرست.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: {
    type: "website",
    url: "/contact",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    title: TITLE,
    description: DESCRIPTION,
    images: ["/logo.png"],
  },
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="kicker text-teal/80">Contact</p>
      <h1 className="font-display mt-3 text-3xl leading-tight text-ink sm:text-4xl">ارتباط با ما</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
        چیزی درست کار نمی‌کند، محتوایی نامناسب دیده‌ای یا اطلاعات فیلمی اشتباه است؟ موضوع را انتخاب کن و برایمان بنویس؛ همهٔ
        پیام‌ها را تیم سینماگزین می‌خواند.
      </p>
      {/* useSearchParams (prefilled topic/page) needs a Suspense boundary on a static page. */}
      <Suspense fallback={<div className="mt-10 h-96 animate-pulse rounded-3xl bg-surface2/50" />}>
        <ContactForm />
      </Suspense>
    </main>
  );
}
