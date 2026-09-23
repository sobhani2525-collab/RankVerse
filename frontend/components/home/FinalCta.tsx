import Link from "next/link";
import Reveal from "./Reveal";

export default function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[#05070D]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 110%, rgba(145,99,245,0.22), transparent 70%), radial-gradient(1px 1px at 20% 30%, rgba(242,240,232,0.4), transparent), radial-gradient(1px 1px at 75% 25%, rgba(242,240,232,0.3), transparent), radial-gradient(1px 1px at 60% 70%, rgba(232,179,74,0.4), transparent), radial-gradient(1px 1px at 35% 80%, rgba(79,184,166,0.4), transparent)",
        }}
      />
      <Reveal className="relative mx-auto flex max-w-4xl flex-col items-center px-6 py-32 text-center">
        <p className="kicker text-teal/80">Every film a star. One universe.</p>
        <h2 className="font-display mt-6 text-4xl leading-tight text-ink sm:text-6xl">
          هر فیلم، یک ستاره.
          <br />
          <span className="gradient-text">همه در یک کهکشان.</span>
        </h2>
        <p className="mt-6 text-lg text-muted">جای خودت را در آن پیدا کن.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="#universe" className="btn-primary text-sm hover:opacity-90">
            کاوش در RankVerse
          </Link>
          <Link href="/battles" className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
            شروع رتبه‌دهی
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
