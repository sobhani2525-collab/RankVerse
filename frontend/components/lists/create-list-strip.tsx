import Link from "next/link";

const CHIPS = [
  { label: "⚡ ساده و سریع", tone: "border-gold/50 bg-gold/10 text-gold" },
  { label: "🕸️ پیشنهاد هوشمند از گراف", tone: "border-violet-light/50 bg-violet-light/10 text-violet-light" },
  { label: "↕️ ترتیب قابل‌تغییر", tone: "border-teal/50 bg-teal/10 text-teal" },
  { label: "🔓 عمومی یا خصوصی", tone: "border-rose-400/50 bg-rose-400/10 text-rose-300" },
];

/**
 * A slim invitation under the lists grid: someone who has just browsed other
 * people's lists is the likeliest to make one.
 */
export default function CreateListStrip() {
  return (
    <section className="relative mt-14 flex flex-col items-center gap-5 overflow-hidden rounded-3xl border border-violet-light/30 px-6 py-8 text-center md:flex-row md:justify-between md:text-start"
      style={{ backgroundImage: "linear-gradient(120deg, rgba(139,108,240,0.22), rgba(18,23,42,0.6) 55%, rgba(79,184,166,0.2))" }}>
      <div>
        <h2 className="text-xl font-black text-ink md:text-2xl">
          تو هم فهرست تازه‌ای بساز!
        </h2>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-ink-dim md:justify-start">
          {CHIPS.map((c) => (
            <li key={c.label} className={`rounded-full border px-3 py-1 font-bold ${c.tone}`}>
              {c.label}
            </li>
          ))}
        </ul>
      </div>
      <Link href="/lists/new" className="btn-primary shrink-0 text-sm shadow-[0_0_30px_rgba(139,108,240,0.45)] hover:opacity-90">
        ساخت فهرست جدید
      </Link>
    </section>
  );
}
