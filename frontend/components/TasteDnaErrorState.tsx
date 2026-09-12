"use client";

interface TasteDnaErrorStateProps {
  onRetry: () => void;
}

export default function TasteDnaErrorState({ onRetry }: TasteDnaErrorStateProps) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 px-6 py-8 text-center">
      <p className="text-sm text-muted">دریافت Taste DNA با مشکل مواجه شد.</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-lg border border-border px-4 py-1.5 text-sm text-ink transition hover:border-gold/50"
      >
        تلاش مجدد
      </button>
    </div>
  );
}
