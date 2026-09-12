"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { rateEntity, unrateEntity, getMyRatings } from "@/lib/api";

export default function RatingWidget({
  slug,
  entityType = "movie",
}: {
  slug: string;
  entityType?: string;
}) {
  const { token } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "removing" | "error">("idle");

  useEffect(() => {
    if (!token) return;
    getMyRatings(token)
      .then((ratings) => {
        const existing = ratings.find((r) => r.movie_slug === slug);
        if (existing) {
          setSelected(existing.score);
          setStatus("saved");
        }
      })
      .catch(() => {});
  }, [token, slug]);

  async function submitRating(score: number) {
    if (!token) {
      setStatus("error");
      return;
    }

    setStatus("saving");
    setSelected(score);

    try {
      await rateEntity(token, slug, score, entityType);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  async function removeRating() {
    if (!token) return;

    setStatus("removing");
    try {
      await unrateEntity(token, slug, entityType);
      setSelected(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  const prompt = entityType === "tv_series" ? "این سریال را چند از ۱۰ می‌دهید؟" : "این فیلم را چند از ۱۰ می‌دهید؟";

  return (
    <div className="rounded-xl border border-border bg-surface/60 px-5 py-4">
      <p className="mb-3 text-sm text-muted">{prompt}</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => submitRating(n)}
            disabled={status === "saving" || status === "removing"}
            className={`num h-9 w-9 rounded-full border text-sm transition ${
              selected === n
                ? "border-gold bg-gold/20 text-gold"
                : "border-border text-muted hover:border-gold/40 hover:text-ink"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {status === "saving" && <p className="mt-2 text-xs text-muted">در حال ثبت...</p>}
      {status === "removing" && <p className="mt-2 text-xs text-muted">در حال حذف...</p>}
      {status === "saved" && selected !== null && (
        <div className="mt-2 flex items-center gap-3">
          <p className="text-xs text-teal">رای شما ثبت شد.</p>
          <button onClick={removeRating} className="text-xs text-muted underline hover:text-gold">
            حذف رای
          </button>
        </div>
      )}
      {status === "error" && (
        <p className="mt-2 text-xs text-gold">
          برای ثبت رای، ابتدا وارد حساب کاربری‌تان شوید.
        </p>
      )}
    </div>
  );
}
