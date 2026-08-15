"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function RatingWidget({ slug }: { slug: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submitRating(score: number) {
    const token = typeof window !== "undefined" ? localStorage.getItem("rv_access_token") : null;
    if (!token) {
      setStatus("error");
      return;
    }

    setStatus("saving");
    setSelected(score);

    try {
      const res = await fetch(`${API_BASE}/movies/${slug}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface/60 px-5 py-4">
      <p className="mb-3 text-sm text-muted">این فیلم را چند از ۱۰ می‌دهید؟</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => submitRating(n)}
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
      {status === "saved" && <p className="mt-2 text-xs text-teal">رای شما ثبت شد.</p>}
      {status === "error" && (
        <p className="mt-2 text-xs text-gold">
          برای ثبت رای، ابتدا وارد حساب کاربری‌تان شوید.
        </p>
      )}
    </div>
  );
}
