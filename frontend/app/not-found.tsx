import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="num text-sm text-teal">404</p>
      <h1 className="mt-3 text-2xl font-bold text-ink">این فیلم روی نقشه پیدا نشد</h1>
      <p className="mt-2 text-sm text-muted">
        شاید هنوز همگام‌سازی نشده یا آدرس اشتباه است.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full border border-gold/40 px-5 py-2 text-sm text-gold hover:bg-gold/10"
      >
        بازگشت به فهرست
      </Link>
    </main>
  );
}
