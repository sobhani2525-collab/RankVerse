"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthorAvatar } from "@/components/lists/list-card";
import { avatarByKey } from "@/lib/avatars";
import { useAuth } from "@/lib/auth-context";
import { absoluteUrl } from "@/lib/site";
import { toFaDigits } from "@/lib/format-number";
import { TournamentDetail, tournamentApi } from "@/lib/tournament";
import WinnerStaysBattle, { DONE_ACTION, Side, WinnerStaysItem } from "@/components/battle/WinnerStaysBattle";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** An admin-featured battle played right on the home page; its picks count like picks made on its own page. */
export default function FeaturedBattleRun({ battle }: { battle: TournamentDetail }) {
  const router = useRouter();
  const { getToken, isAuthenticated, loading: authLoading } = useAuth();
  const signedIn = !authLoading && isAuthenticated;

  const items: WinnerStaysItem[] = useMemo(
    () =>
      shuffled(battle.participants).map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        title_fa: p.title_fa,
        entity_type: p.entity_type,
        poster_path: p.poster_url?.startsWith("/") ? p.poster_url : null,
        year: p.year ?? null,
      })),
    [battle.slug, battle.participants] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const savePick = useCallback(
    async (championId: string, challengerId: string, winner: Side) => {
      const token = getToken();
      if (!token) return;
      await tournamentApi.pick(token, battle.slug, {
        champion_id: championId,
        challenger_id: challengerId,
        winner_id: winner === "left" ? championId : challengerId,
      });
    },
    [getToken, battle.slug]
  );

  return (
    <div>
      <header className="mx-auto mb-10 flex max-w-2xl flex-col items-center gap-4 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-bold text-gold">
          <span aria-hidden="true">★</span>
          نبرد برگزیده
        </span>
        <Link
          href={`/battles/${battle.slug}`}
          className="text-[28px] font-black leading-[1.35] text-ink transition hover:text-gold sm:text-4xl sm:leading-[1.3]"
        >
          {battle.title}
        </Link>
        {battle.description && <p className="max-w-xl text-sm leading-7 text-ink-dim">{battle.description}</p>}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted">
          {battle.creator && (
            <Link
              href={`/profile/${encodeURIComponent(battle.creator.username)}`}
              className="flex items-center gap-2 text-ink-dim transition hover:text-ink"
            >
              {avatarByKey(battle.creator.avatar_key) ? (
                <AuthorAvatar
                  author={{ username: battle.creator.username, avatarKey: battle.creator.avatar_key }}
                  sizeClassName="h-8 w-8"
                  textClassName="text-base"
                />
              ) : (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-light bg-surface-2 text-sm font-extrabold uppercase text-violet-light"
                  aria-hidden="true"
                >
                  {battle.creator.username.charAt(0)}
                </span>
              )}
              <span>{battle.creator.display_name || <span dir="ltr">@{battle.creator.username}</span>}</span>
            </Link>
          )}
          {battle.creator && <span className="h-4 w-px bg-border" aria-hidden="true" />}
          <span dir="rtl">{toFaDigits(battle.participants.length)} گزینه</span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span dir="rtl">{toFaDigits(battle.follower_count)} دنبال‌کننده</span>
        </div>
      </header>

      <WinnerStaysBattle
        items={items}
        category={battle.entity_type}
        signedIn={signedIn}
        reason="هر بار برنده می‌ماند و با گزینهٔ بعدی روبه‌رو می‌شود"
        share={{ url: absoluteUrl(`/battles/${battle.slug}`), topic: null, battleName: battle.title }}
        savePick={savePick}
        onNext={() => router.push("/battles")}
        onSkipBattle={() => router.push("/battles")}
        extraDoneActions={
          <Link href={`/battles/${battle.slug}`} className={DONE_ACTION}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 20V10M12 20V4M19 20v-7" />
            </svg>
            نتیجهٔ جمعی این نبرد
          </Link>
        }
      />
    </div>
  );
}
