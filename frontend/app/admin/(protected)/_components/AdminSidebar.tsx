"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  secondary?: { label: string; href: string };
}

const NAV_ITEMS: NavItem[] = [
  { label: "داشبورد", href: "/admin/dashboard" },
  { label: "موجودیت‌ها و روابط", href: "/admin/entities", secondary: { label: "روابط", href: "/admin/relations" } },
  { label: "Ingestion و منابع داده", href: "/admin/ingestion" },
  { label: "الگوریتم‌ها", href: "/admin/algorithms" },
  { label: "کاربران و جامعه", href: "/admin/users" },
  { label: "آنالیتیکس", href: "/admin/analytics" },
  { label: "سلامت زیرساخت", href: "/admin/health" },
  { label: "SEO و کشف محتوا", href: "/admin/seo" },
  { label: "Audit Log", href: "/admin/audit-log" },
];

export function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-l border-border bg-surface">
      <div className="border-b border-border px-5 py-5">
        <p className="text-lg font-bold text-gold">RankVerse</p>
        <p className="text-xs text-muted">پنل مدیریت</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-gold/10 font-bold text-gold"
                      : "text-ink hover:bg-surface2"
                  }`}
                >
                  {item.label}
                </Link>
                {item.secondary && (
                  <Link
                    href={item.secondary.href}
                    className={`mr-3 mt-0.5 block rounded-lg px-3 py-1.5 text-xs transition ${
                      pathname === item.secondary.href
                        ? "bg-teal/10 font-bold text-teal"
                        : "text-muted hover:bg-surface2"
                    }`}
                  >
                    {item.secondary.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-5 py-4">
        <p className="truncate text-xs text-muted" dir="ltr">{adminEmail}</p>
        <button
          onClick={handleLogout}
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50 hover:text-gold"
        >
          خروج
        </button>
      </div>
    </aside>
  );
}
