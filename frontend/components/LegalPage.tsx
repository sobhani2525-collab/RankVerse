import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

/** Persian date the privacy/terms texts last changed. */
export const LEGAL_UPDATED = "۱ آبان ۱۴۰۵";

export function legalMetadata(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, siteName: SITE_NAME, locale: SITE_LOCALE, title, description, images: ["/logo.png"] },
  };
}

/** Shared shell of the about / privacy / terms pages, styled like /contact. */
export function LegalPage({
  kicker,
  title,
  intro,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  intro: ReactNode;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="kicker text-teal/80">{kicker}</p>
      <h1 className="font-display mt-3 text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{intro}</p>
      {updated && <p className="mt-2 text-xs text-dim">آخرین به‌روزرسانی: {updated}</p>}
      <div className="mt-10 flex flex-col gap-8">{children}</div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-8 text-muted sm:text-[15px] [&_a]:text-teal [&_a:hover]:underline [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pr-5">
        {children}
      </div>
    </section>
  );
}
