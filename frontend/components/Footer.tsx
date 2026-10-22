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
    title: "نبردها",
    links: [
      { href: "/battles/daily", label: "نبرد روز" },
      { href: "/battles", label: "نبرد بهترین‌ها" },
      { href: "/battles/new", label: "ساخت نبرد" },
    ],
  },
  {
    title: "فهرست‌ها",
    links: [
      { href: "/lists", label: "فهرست‌های کاربران" },
      { href: "/lists/new", label: "ساخت فهرست جدید" },
    ],
  },
  {
    title: "حساب من",
    links: [
      { href: "/profile", label: "پروفایل و سلیقهٔ سینمایی" },
      { href: "/profile#my-lists", label: "فهرست‌های من" },
      { href: "/battles/mine", label: "نبردهای من" },
      { href: "/notifications", label: "اعلان‌ها" },
      { href: "/login", label: "ورود / ثبت‌نام" },
    ],
  },
  {
    title: "پشتیبانی",
    links: [
      { href: "/contact", label: "ارتباط با ما" },
      { href: "/contact?topic=bug", label: "گزارش خطا" },
      { href: "/contact?topic=inappropriate", label: "گزارش محتوای نامناسب" },
      { href: "/contact?topic=content_error", label: "اصلاح اطلاعات" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-12 md:grid-cols-3 lg:grid-cols-[1.6fr_repeat(5,1fr)]">
        <div className="col-span-2 max-w-xs md:col-span-3 lg:col-span-1">
          <Link href="/" aria-label={SITE_NAME}>
            <Image src="/brand-logo.png" alt={SITE_NAME} width={462} height={160} className="h-11 w-auto" />
          </Link>
          <p className="mt-4 text-sm font-bold text-ink">{SITE_TAGLINE}</p>
          <p className="mt-2 text-sm leading-7 text-muted">
            فیلم‌ها، سریال‌ها، هنرمندان و ژانرها را روی یک کهکشان ببین؛ امتیاز بده، در نبردها رأی بده، فهرست خودت را بساز و
            پیشنهادهایی بگیر که به سلیقه‌ات می‌خورد.
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
