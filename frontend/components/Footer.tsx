import Image from "next/image";
import Link from "next/link";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

const COLUMNS = [
  {
    title: "کاوش",
    links: [
      { href: "/rankings", label: "فیلم‌ها" },
      { href: "/rankings?type=tv_series", label: "سریال‌ها" },
      { href: "/people", label: "هنرمندان" },
      { href: "/#universe", label: "نقشهٔ ارتباط‌ها" },
    ],
  },
  {
    title: "مشارکت",
    links: [
      { href: "/battles", label: "نبرد بهترین‌ها" },
      { href: "/lists", label: "فهرست‌های کاربران" },
      { href: "/lists/new", label: "ساخت فهرست جدید" },
    ],
  },
  {
    title: "حساب من",
    links: [
      { href: "/register", label: "ثبت‌نام" },
      { href: "/login", label: "ورود" },
      { href: "/profile", label: "پروفایل" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Link href="/" aria-label={SITE_NAME}>
            <Image src="/brand-logo.png" alt={SITE_NAME} width={454} height={160} className="h-11 w-auto" />
          </Link>
          <p className="mt-4 text-sm font-bold text-ink">{SITE_TAGLINE}</p>
          <p className="mt-2 text-sm leading-7 text-muted">
            فیلم‌ها و سریال‌ها را در یک کهکشان ببین؛ رأی بده، نبرد کن و فهرست خودت را بساز.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-bold text-ink">{col.title}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted transition hover:text-gold">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-xs leading-6 text-dim md:flex-row md:items-center md:justify-between">
          <p>© {SITE_NAME} — همهٔ حقوق محفوظ است.</p>
          <p dir="rtl">
            اطلاعات فیلم‌ها از{" "}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-gold">
              TMDb
            </a>{" "}
            گرفته شده و این سایت را TMDb تأیید یا گواهی نکرده است.
          </p>
        </div>
      </div>
    </footer>
  );
}
