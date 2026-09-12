"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getNextBattle, castBattleVote } from "@/lib/api";
import { NextBattleResponse, VoteOutcome } from "@/lib/types";
import BattleCard from "@/components/BattleCard";

const CATEGORIES = [
  { value: "movie", label: "فیلم" },
  { value: "tv_series", label: "سریال" },
  { value: "person", label: "افراد" },
  { value: "genre", label: "ژانر" },
  { value: "country", label: "کشور" },
];

type RevealState = {
  leftDelta: number;
  rightDelta: number;
} | null;

export default function BattlesPage() {
  const { token, isAuthenticated, loading: authLoading } = useAuth();

  const [category, setCategory] = useState("movie");
  const [battle, setBattle] = useState<NextBattleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealState>(null);
  const [outcomes, setOutcomes] = useState<{ left?: "win" | "lose"; right?: "win" | "lose" }>({});

  const loadNextBattle = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setReveal(null);
    setOutcomes({});
    try {
      const next = await getNextBattle(token, category);
      setBattle(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در دریافت نبرد بعدی");
      setBattle(null);
    } finally {
      setLoading(false);
    }
  }, [token, category]);

  useEffect(() => {
    if (isAuthenticated) {
      loadNextBattle();
    }
  }, [isAuthenticated, loadNextBattle]);

  async function handleVote(winner: VoteOutcome) {
    if (!token || !battle || voting) return;
    setVoting(true);
    setError(null);
    if (winner === "left") setOutcomes({ left: "win", right: "lose" });
    else if (winner === "right") setOutcomes({ left: "lose", right: "win" });
    try {
      const result = await castBattleVote(token, {
        category: battle.category,
        left_item: battle.left.id,
        right_item: battle.right.id,
        winner,
      });

      setReveal({
        leftDelta: Math.round(result.left_score_after - result.left_score_before),
        rightDelta: Math.round(result.right_score_after - result.right_score_before),
      });

      // Briefly show the green fade + score change, then move on.
      setTimeout(() => {
        loadNextBattle();
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ثبت رأی");
      setOutcomes({});
    } finally {
      setVoting(false);
    }
  }

  if (authLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">در حال بارگذاری…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-semibold text-ink">نبرد بهترین‌ها</h1>
        <p className="mb-6 text-muted">برای رأی دادن در نبردها ابتدا وارد حساب‌تان شوید.</p>
        <Link
          href="/login"
          className="inline-block rounded-xl border border-gold/40 bg-gold/10 px-5 py-2 text-gold transition hover:bg-gold/20"
        >
          ورود به حساب
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold text-ink">نبرد بهترین‌ها</h1>
        <p className="text-sm text-muted">هر بار یکی را انتخاب کنید تا رتبه‌بندی دقیق‌تر شود.</p>

        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              disabled={loading || voting}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                category === c.value
                  ? "border-gold/50 bg-gold/15 text-gold"
                  : "border-border bg-surface/60 text-muted hover:bg-surface2"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-400">
          {error}
        </div>
      )}

      {loading || !battle ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
          <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <BattleCard
              entity={battle.left}
              onSelect={() => handleVote("left")}
              disabled={voting}
              revealScore={!!reveal}
              scoreDelta={reveal?.leftDelta}
              outcome={outcomes.left}
            />
            <BattleCard
              entity={battle.right}
              onSelect={() => handleVote("right")}
              disabled={voting}
              revealScore={!!reveal}
              scoreDelta={reveal?.rightDelta}
              outcome={outcomes.right}
            />
          </div>

          <div className="mt-6 flex justify-center">
            <button
              onClick={() => handleVote("skip")}
              disabled={voting}
              className="rounded-full border border-border px-5 py-2 text-sm text-muted transition hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              رد کردن این جفت
            </button>
          </div>
        </>
      )}
    </div>
  );
}
