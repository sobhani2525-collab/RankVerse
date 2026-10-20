"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { searchEntities } from "@/lib/api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { CandidateEntity, GenreOption, TournamentEntity, TournamentEntityType, tournamentApi } from "@/lib/tournament";
import Poster from "./Poster";

const ROLES = [
  { value: "all", label: "هر نقش" },
  { value: "director", label: "کارگردان" },
  { value: "actor", label: "بازیگر" },
  { value: "creator", label: "سازنده" },
];

const DECADES = Array.from({ length: 11 }, (_, i) => 2020 - i * 10);

const FIELD = "rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-ink outline-none focus:border-gold/60";

interface PersonOption {
  slug: string;
  title: string;
}

/**
 * Finds entities of the battle's type to add: by title, or narrowed by any mix
 * of a person (director/actor/creator), a genre and a decade -- all filters
 * must hold, e.g. 1990s comedies. Clicking a result adds it to the bracket.
 */
export default function EntryPicker({
  entityType,
  selectedIds,
  full,
  onAdd,
  onAddMany,
}: {
  entityType: TournamentEntityType;
  selectedIds: string[];
  full: boolean;
  onAdd: (entity: TournamentEntity) => void;
  onAddMany: (entities: TournamentEntity[]) => void;
}) {
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 350);
  const [genres, setGenres] = useState<GenreOption[]>([]);
  const [genre, setGenre] = useState("");
  const [decade, setDecade] = useState("");
  const [role, setRole] = useState("all");
  const [personQuery, setPersonQuery] = useState("");
  const debouncedPerson = useDebouncedValue(personQuery.trim(), 350);
  const [personHits, setPersonHits] = useState<PersonOption[]>([]);
  const [person, setPerson] = useState<PersonOption | null>(null);
  const [results, setResults] = useState<CandidateEntity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFilter = !!(person || genre || decade || debouncedQuery);

  useEffect(() => {
    const token = getToken();
    if (token) tournamentApi.genres(token).then(setGenres).catch(() => {});
  }, [getToken]);

  useEffect(() => {
    if (!debouncedPerson || person) {
      setPersonHits([]);
      return;
    }
    let cancelled = false;
    searchEntities(debouncedPerson, "person")
      .then((rows) => !cancelled && setPersonHits(rows.slice(0, 6).map((r) => ({ slug: r.slug, title: displayTitle(r) }))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debouncedPerson, person]);

  const search = useCallback(async () => {
    const token = getToken();
    if (!token || !hasFilter) {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResults(
        await tournamentApi.candidates(token, {
          entity_type: entityType,
          person: person?.slug,
          role: person ? role : undefined,
          genre: genre || undefined,
          decade: decade ? Number(decade) : undefined,
          q: debouncedQuery || undefined,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در جستجو");
    } finally {
      setLoading(false);
    }
  }, [getToken, hasFilter, entityType, person, role, genre, decade, debouncedQuery]);

  useEffect(() => {
    search();
  }, [search]);

  const available = (results ?? []).filter((r) => !selectedIds.includes(r.id));

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="جستجوی عنوان…"
        className={`${FIELD} w-full`}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="relative">
          {person ? (
            <button
              type="button"
              onClick={() => {
                setPerson(null);
                setPersonQuery("");
              }}
              className={`${FIELD} flex w-full items-center justify-between text-gold`}
            >
              <span className="truncate">{person.title}</span>
              <span aria-label="حذف فیلتر">✕</span>
            </button>
          ) : (
            <input
              value={personQuery}
              onChange={(e) => setPersonQuery(e.target.value)}
              placeholder="کارگردان یا بازیگر…"
              className={`${FIELD} w-full`}
            />
          )}
          {personHits.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
              {personHits.map((p) => (
                <li key={p.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      setPerson(p);
                      setPersonHits([]);
                    }}
                    className="block w-full px-3 py-2 text-right text-sm text-ink hover:bg-surface2"
                  >
                    {p.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <select value={genre} onChange={(e) => setGenre(e.target.value)} className={FIELD} aria-label="ژانر">
          <option value="">همهٔ ژانرها</option>
          {genres.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.title_fa || g.title}
            </option>
          ))}
        </select>
        <select value={decade} onChange={(e) => setDecade(e.target.value)} className={FIELD} aria-label="دهه">
          <option value="">همهٔ دهه‌ها</option>
          {DECADES.map((d) => (
            <option key={d} value={d}>
              دههٔ {toFaDigits(d)} میلادی
            </option>
          ))}
        </select>
      </div>

      {person && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={`rounded-full border px-3 py-1 text-xs ${
                role === r.value ? "border-gold text-gold" : "border-border text-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        {!hasFilter && (
          <p className="py-6 text-center text-sm text-muted">
            عنوان بنویس یا فیلتر بگذار؛ مثلاً ژانر «کمدی» و دههٔ ۱۹۹۰.
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading && <p className="py-4 text-center text-sm text-muted">در حال جستجو…</p>}
        {hasFilter && !loading && results && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>{toFaDigits(available.length)} نتیجه</span>
              {available.length > 0 && !full && (
                <button
                  type="button"
                  onClick={() => onAddMany(available)}
                  className="flex items-center gap-2 rounded-xl border border-gold/60 bg-gold/10 px-4 py-2.5 text-sm font-extrabold text-gold shadow-[0_0_0_3px_rgba(232,179,74,0.12)] transition hover:bg-gold/20"
                >
                  <span aria-hidden="true">⚡</span>
                  افزودن به ترتیب امتیاز تا پر شدن
                </button>
              )}
            </div>
            {available.length === 0 && <p className="py-4 text-center text-sm text-muted">نتیجه‌ای پیدا نشد.</p>}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {available.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={full}
                  onClick={() => onAdd(r)}
                  className="group text-right disabled:opacity-40"
                  title={displayTitle(r)}
                >
                  <Poster entity={r} size="w185" className="transition group-hover:border-gold" />
                  {r.title_fa ? (
                    <>
                      <p className="mt-1 line-clamp-1 text-xs text-ink-dim">{r.title_fa}</p>
                      <p className="line-clamp-1 text-[10px] text-muted" dir="ltr">{r.title}</p>
                    </>
                  ) : (
                    <p className="mt-1 line-clamp-1 text-xs text-ink-dim">{r.title}</p>
                  )}
                  {r.year && <p className="num text-[10px] text-muted">{toFaDigits(r.year)}</p>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
