import Link from "next/link";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import { ENTITY_TYPE_LABELS, STATUS_LABELS, TournamentSummary, tournamentHref } from "@/lib/tournament";
import Poster from "./Poster";

export default function TournamentCard({ battle }: { battle: TournamentSummary }) {
  const preview = battle.preview ?? [];
  return (
    <Link
      href={tournamentHref(battle.slug)}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-gold/50"
    >
      <div className="grid grid-cols-4 gap-2">
        {preview.slice(0, 4).map((e) => (
          <Poster key={e.id} entity={e} size="w185" />
        ))}
      </div>
      <div>
        <h3 className="line-clamp-2 text-base font-bold text-ink group-hover:text-gold">{battle.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full border border-border px-2 py-0.5">{ENTITY_TYPE_LABELS[battle.entity_type]}</span>
          <span className="num">{toFaDigits(battle.bracket_size)} گزینه</span>
          {battle.mode === "tournament" && (
            <span className={battle.status === "active" ? "text-teal" : ""}>{STATUS_LABELS[battle.status]}</span>
          )}
          {battle.mode === "pool" && battle.status === "archived" && <span>{STATUS_LABELS[battle.status]}</span>}
          {battle.is_official && <span className="text-gold">رسمی</span>}
        </div>
        {battle.status === "completed" && battle.winner && (
          <p className="mt-2 text-sm text-gold">قهرمان: {displayTitle(battle.winner)}</p>
        )}
      </div>
    </Link>
  );
}
