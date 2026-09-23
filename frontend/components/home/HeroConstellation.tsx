"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Constellation from "@/components/Constellation";
import { HomeTitle } from "@/lib/home-data";
import { displayTitle } from "@/lib/title";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { detailPathFor } from "@/lib/entity-routes";

interface PlacedNode {
  title: HomeTitle;
  x: number;
  y: number;
  r: number;
}

interface Edge {
  a: number;
  b: number;
  sharedDirector: boolean;
  weight: number;
}

// Server and browser Math.cos/sin can differ in the last digits, which
// breaks hydration -- every computed coordinate goes through this.
const round2 = (v: number) => Math.round(v * 100) / 100;

// Cheap deterministic hash so a title keeps its spot across renders and
// between server and client (no Math.random -> no hydration mismatch).
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * #1 sits at the centre; the next five on an inner orbit, the rest on an
 * outer one -- so position encodes rank, radius encodes score.
 */
function placeNodes(titles: HomeTitle[]): PlacedNode[] {
  const scores = titles.map((t) => t.score).filter((s): s is number => s !== null);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  return titles.map((t, i) => {
    const jitter = hash(t.id);
    const norm = t.score === null || max === min ? 0.5 : (t.score - min) / (max - min);
    const r = round2(1.2 + norm * 1.2 + (i === 0 ? 0.8 : 0));

    if (i === 0) return { title: t, x: 50, y: 50, r };

    const inner = i <= 5;
    const slot = inner ? i - 1 : i - 6;
    const slots = inner ? 5 : Math.max(1, titles.length - 6);
    const baseAngle = inner ? -90 + (360 / slots) * slot : -60 + (360 / slots) * slot;
    const angle = ((baseAngle + (jitter - 0.5) * 18) * Math.PI) / 180;
    const radius = (inner ? 24 : 40) + (jitter - 0.5) * 6;
    return {
      title: t,
      x: round2(Math.min(94, Math.max(6, 50 + radius * Math.cos(angle)))),
      y: round2(Math.min(94, Math.max(6, 50 + radius * Math.sin(angle)))),
      r,
    };
  });
}

/**
 * Real relationships only: two titles are linked when they share a
 * director (strong) and/or genres (one point per shared genre). Each node
 * keeps at most its three strongest links so the sky stays readable.
 */
function buildEdges(titles: HomeTitle[]): Edge[] {
  const candidates: Edge[] = [];
  for (let a = 0; a < titles.length; a++) {
    for (let b = a + 1; b < titles.length; b++) {
      const dirsA = new Set(titles[a].directors.map((d) => d.slug));
      const genresA = new Set(titles[a].genres.map((g) => g.slug));
      const sharedDirector = titles[b].directors.some((d) => dirsA.has(d.slug));
      const sharedGenres = titles[b].genres.filter((g) => genresA.has(g.slug)).length;
      const weight = (sharedDirector ? 3 : 0) + sharedGenres;
      if (weight > 0) candidates.push({ a, b, sharedDirector, weight });
    }
  }

  const kept = new Set<Edge>();
  for (let n = 0; n < titles.length; n++) {
    candidates
      .filter((e) => e.a === n || e.b === n)
      .sort((x, y) => y.weight - x.weight)
      .slice(0, 3)
      .forEach((e) => kept.add(e));
  }
  return [...kept];
}

export default function HeroConstellation({ titles }: { titles: HomeTitle[] }) {
  const nodes = useMemo(() => placeNodes(titles), [titles]);
  const edges = useMemo(() => buildEdges(titles), [titles]);
  const [active, setActive] = useState<number | null>(null);
  const pointerType = useRef<string>("mouse");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connected = useMemo(() => {
    if (active === null) return null;
    const set = new Set<number>([active]);
    edges.forEach((e) => {
      if (e.a === active) set.add(e.b);
      if (e.b === active) set.add(e.a);
    });
    return set;
  }, [active, edges]);

  function show(i: number) {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setActive(i);
  }
  function hideSoon() {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setActive(null), 180);
  }

  if (nodes.length === 0) return null;
  const activeNode = active !== null ? nodes[active] : null;

  return (
    <div
      className="relative aspect-square w-full"
      onMouseLeave={hideSoon}
      // Faint background stars -- decorative, not data (CSS rather than
      // sub-pixel SVG circles, which rasterise as streaks in Chromium).
      style={{
        backgroundImage:
          "radial-gradient(1px 1px at 12% 18%, rgba(242,240,232,.35), transparent), radial-gradient(1px 1px at 82% 12%, rgba(242,240,232,.25), transparent), radial-gradient(1px 1px at 68% 84%, rgba(242,240,232,.3), transparent), radial-gradient(1px 1px at 24% 72%, rgba(242,240,232,.25), transparent), radial-gradient(1px 1px at 91% 58%, rgba(242,240,232,.3), transparent), radial-gradient(1px 1px at 40% 8%, rgba(242,240,232,.2), transparent), radial-gradient(1px 1px at 6% 46%, rgba(242,240,232,.25), transparent), radial-gradient(1px 1px at 55% 96%, rgba(242,240,232,.2), transparent)",
      }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id="rv-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFF7E0" />
            <stop offset="55%" stopColor="#E8B34A" />
            <stop offset="100%" stopColor="#E8B34A" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="rv-core-cool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F2F0E8" />
            <stop offset="60%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#9163f5" stopOpacity="0.2" />
          </radialGradient>
        </defs>

        <g className="rv-drift">

          {/* Orbit guides: inner = ranks 2–6, outer = 7+ */}
          <circle cx="50" cy="50" r="24" fill="none" stroke="#F2F0E8" strokeOpacity="0.05" strokeWidth="0.15" strokeDasharray="0.6 1.2" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#F2F0E8" strokeOpacity="0.04" strokeWidth="0.15" strokeDasharray="0.6 1.2" />

          {edges.map((e, i) => {
            const A = nodes[e.a];
            const B = nodes[e.b];
            const lit = active !== null && (e.a === active || e.b === active);
            const dim = active !== null && !lit;
            return (
              <line
                key={i}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                pathLength={1}
                className="rv-draw transition-[stroke-opacity] duration-300"
                stroke={e.sharedDirector ? "#E8B34A" : "#4FB8A6"}
                strokeOpacity={lit ? 0.85 : dim ? 0.05 : 0.22 + Math.min(e.weight, 3) * 0.06}
                strokeWidth={lit ? 0.35 : 0.18}
                style={{ ["--rv-delay" as string]: `${round2(0.3 + i * 0.05)}s` }}
              />
            );
          })}

          {nodes.map((n, i) => {
            const dim = connected !== null && !connected.has(i);
            return (
              <g key={n.title.id} className="transition-opacity duration-300" opacity={dim ? 0.3 : 1}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={round2(n.r * 1.9)}
                  fill={i === 0 ? "#E8B34A" : "#9163f5"}
                  className="rv-halo"
                  style={{ ["--rv-delay" as string]: `${round2(hash(n.title.id) * 5)}s`, ["--rv-dur" as string]: `${round2(5 + hash(n.title.slug) * 4)}s` }}
                />
                <circle cx={n.x} cy={n.y} r={active === i ? round2(n.r * 1.3) : n.r} fill={i < 3 ? "url(#rv-core)" : "url(#rv-core-cool)"} className="transition-all duration-300" />
                {(n.title.rank <= 5 || active === i) && (
                  <text
                    x={round2(n.x + n.r + 1.4)}
                    y={round2(n.y - n.r - 0.4)}
                    fontSize="2.4"
                    direction="ltr"
                    fill={active === i ? "#E8B34A" : "#8A93A6"}
                    fillOpacity={active === i ? 1 : 0.75}
                    style={{ fontFamily: "var(--font-vazirmatn)" }}
                  >
                    {toFaDigits(n.title.rank)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Real, focusable hit targets over the SVG (one per title). */}
      {nodes.map((n, i) => (
        <Link
          key={n.title.id}
          href={detailPathFor(n.title.entity_type, n.title.slug) ?? `/movies/${n.title.slug}`}
          aria-label={`${displayTitle(n.title)} — رتبه ${toFaDigits(n.title.rank)}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-gold"
          style={{ left: `${n.x}%`, top: `${n.y}%`, width: "9%", height: "9%", minWidth: 36, minHeight: 36 }}
          onPointerDown={(e) => {
            pointerType.current = e.pointerType;
          }}
          onClick={(e) => {
            // Touch has no hover: the first tap opens the card, a second tap follows the link.
            if (pointerType.current !== "mouse" && active !== i) {
              e.preventDefault();
              show(i);
            }
          }}
          onMouseEnter={() => show(i)}
          onMouseLeave={hideSoon}
          onFocus={() => show(i)}
          onBlur={hideSoon}
        />
      ))}

      {activeNode && (
        <InfoCard
          node={activeNode}
          onEnter={() => show(active!)}
          onLeave={hideSoon}
        />
      )}
    </div>
  );
}

function InfoCard({ node, onEnter, onLeave }: { node: PlacedNode; onEnter: () => void; onLeave: () => void }) {
  const t = node.title;
  const href = detailPathFor(t.entity_type, t.slug) ?? `/movies/${t.slug}`;
  const toLeft = node.x > 50;
  const shiftY = node.y < 30 ? "-12%" : node.y > 70 ? "-88%" : "-50%";

  return (
    <div
      role="dialog"
      aria-label={displayTitle(t)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="rv-rise absolute z-20 w-64 rounded-2xl border border-white/10 bg-[#0A0F18]/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-md max-md:!inset-x-0 max-md:!bottom-0 max-md:!top-auto max-md:!w-auto max-md:!translate-y-0"
      style={{
        top: `${node.y}%`,
        transform: `translateY(${shiftY})`,
        ...(toLeft ? { right: `calc(${100 - node.x}% + 22px)` } : { left: `calc(${node.x}% + 22px)` }),
      }}
    >
      <div className="flex gap-3">
        <div className="relative h-[84px] w-14 shrink-0 overflow-hidden rounded-md bg-surface2">
          {t.posterUrl ? (
            <Image src={t.posterUrl} alt="" fill sizes="56px" className="object-cover" />
          ) : (
            <span className="absolute inset-0 bg-gradient-brand opacity-40" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="num text-2xl font-bold text-gold">#{toFaDigits(t.rank)}</span>
            {t.score !== null && <span className="num text-lg text-ink">{toFaDigits(t.score.toFixed(1))}</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-ink">{displayTitle(t)}</p>
          {t.directors[0] && <p className="truncate text-xs text-muted">{t.directors[0].title}</p>}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-3">
        <div className="min-w-0 text-xs text-muted">
          {t.genres.length > 0 && <p className="truncate">{t.genres.slice(0, 2).map((g) => genreLabel(g.title)).join(" · ")}</p>}
          {t.year && <p className="num">{toFaDigits(t.year)}</p>}
        </div>
        {/* The same director/genre/year glyph the ranking rows use, fed real data. */}
        <Constellation director={t.directors[0]?.title} genre={t.genres[0]?.title} year={t.year} size={48} />
      </div>

      <Link href={href} className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-gold/30 bg-gold/10 py-2 text-xs font-semibold text-gold transition hover:bg-gold/20">
        کاوش فیلم
        <span aria-hidden="true">←</span>
      </Link>
    </div>
  );
}
