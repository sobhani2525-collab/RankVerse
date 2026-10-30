"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { EgoGraph, EgoNode } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { detailPathFor } from "@/lib/entity-routes";

/**
 * The "orbit" drawing of one ego graph: centre in the middle, its titles on
 * an inner ring, people and genres on an outer one, curved links between
 * them (the rest dim only while a star is hovered), and a hover card that
 * links to each node's page. Shared by the home hero (HeroConstellation)
 * and the movie / series page's OVERVIEW graph (EntityOverviewGraph); what
 * a click on a star does is up to the caller.
 */

interface PlacedNode {
  node: EgoNode;
  x: number;
  y: number;
  r: number;
}

interface Edge {
  a: number;
  b: number;
  kind: "credit" | "genre";
}

// Every computed coordinate goes through this so the markup is stable.
const round2 = (v: number) => Math.round(v * 100) / 100;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const INNER_R = 23;
const OUTER_R = 40;
const MIN_GAP = 34; // degrees between neighbours on the outer ring

function circularMean(angles: number[]): number {
  const x = angles.reduce((s, a) => s + Math.cos(a), 0);
  const y = angles.reduce((s, a) => s + Math.sin(a), 0);
  return Math.atan2(y, x);
}

/**
 * Centre in the middle; the titles on an inner orbit; people and genres on
 * an outer one, each sitting at the mean angle of the titles it links to so
 * the edges stay short and don't cross the whole sky.
 */
function layout(graph: EgoGraph): { nodes: PlacedNode[]; edges: Edge[] } {
  const centerIdx = graph.nodes.findIndex((n) => n.id === graph.center_id);
  const ordered = [graph.nodes[centerIdx], ...graph.nodes.filter((_, i) => i !== centerIdx)];
  const index = new Map(ordered.map((n, i) => [n.id, i]));
  const edges: Edge[] = graph.edges.flatMap((e) => {
    const a = index.get(e.source);
    const b = index.get(e.target);
    return a === undefined || b === undefined ? [] : [{ a, b, kind: e.kind }];
  });

  const angle = new Map<number, number>(); // node index -> radians
  const works = ordered.map((n, i) => ({ n, i })).filter(({ n }) => n.role === "work");
  works.forEach(({ i }, k) => angle.set(i, ((-90 + (360 / works.length) * k) * Math.PI) / 180));

  const outer = ordered.map((n, i) => ({ n, i })).filter(({ n }) => n.role === "person" || n.role === "genre");
  const desired = outer.map(({ i }) => {
    const linked = edges
      .filter((e) => e.a === i || e.b === i)
      .map((e) => angle.get(e.a === i ? e.b : e.a))
      .filter((a): a is number => a !== undefined);
    return linked.length > 0 ? circularMean(linked) : null;
  });
  // Unlinked ones (e.g. a title centre's own cast) spread over the free arc.
  const free = desired.filter((d) => d === null).length;
  let k = 0;
  const deg = desired.map((d) => {
    if (d !== null) return (d * 180) / Math.PI;
    const a = -90 + 20 + ((360 - 40) / Math.max(1, free)) * k;
    k++;
    return a;
  });

  // Relax: push neighbours on the ring apart until they stop overlapping.
  const mod = (v: number) => ((v % 360) + 360) % 360;
  const order = deg.map((_, j) => j).sort((p, q) => mod(deg[p]) - mod(deg[q]));
  const norm = order.map((j) => mod(deg[j]));
  for (let iter = 0; iter < 12 && norm.length > 1; iter++) {
    for (let m = 0; m < norm.length; m++) {
      const nxt = (m + 1) % norm.length;
      let diff = norm[nxt] - norm[m];
      if (nxt === 0) diff += 360;
      if (diff < MIN_GAP) {
        const push = (MIN_GAP - diff) / 2;
        norm[m] -= push;
        norm[nxt] += push;
      }
    }
  }
  order.forEach((j, m) => angle.set(outer[j].i, (norm[m] * Math.PI) / 180));

  const nodes: PlacedNode[] = ordered.map((node, i) => {
    if (i === 0) return { node, x: 50, y: 50, r: 3.6 };
    const a = angle.get(i) ?? 0;
    const radius = node.role === "work" ? INNER_R : OUTER_R;
    const r = node.role === "work" ? 2.6 : node.role === "person" ? 2.1 : 1.5;
    return {
      node,
      x: round2(Math.min(92, Math.max(8, 50 + radius * Math.cos(a)))),
      y: round2(Math.min(92, Math.max(8, 50 + radius * Math.sin(a)))),
      r,
    };
  });
  return { nodes, edges };
}

// Persian name when there is one, the original otherwise.
export function nameOf(n: EgoNode): string {
  return n.entity_type === "genre" ? genreLabel(n.title) : n.title_fa ?? n.title;
}

function labelOf(n: EgoNode, max = 14): string {
  const t = nameOf(n);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * A gentle arc from A to B instead of a straight ruler line: the control
 * point sits off the midpoint, bowed away from the centre of the sky so the
 * links swirl around the core like orbits. Edges that run through the centre
 * all bend the same way, which keeps the whole figure turning one direction.
 */
function arcPath(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  // unit normal, flipped to point away from (50, 50)
  let nx = -dy / len;
  let ny = dx / len;
  const ox = mx - 50;
  const oy = my - 50;
  if (Math.hypot(ox, oy) > 2 && nx * ox + ny * oy < 0) {
    nx = -nx;
    ny = -ny;
  }
  const bend = len * 0.22;
  return `M${ax} ${ay} Q${round2(mx + nx * bend)} ${round2(my + ny * bend)} ${bx} ${by}`;
}

// Latin names need an LTR base direction or the ellipsis lands on the wrong end.
const isLatin = (t: string) => !/[؀-ۿ]/.test(t);

const ROLE_LABEL: Record<string, string> = { directed_by: "کارگردان", creator: "سازنده", acted_in: "بازیگر" };

export function roleOf(n: EgoNode): string | null {
  if (n.entity_type !== "person" || !n.credits || n.credits.length === 0) return null;
  return n.credits.map((c) => ROLE_LABEL[c]).filter(Boolean).join("، ");
}

export const TYPE_LABEL: Record<string, string> = { movie: "فیلم", tv_series: "سریال", person: "هنرمند", genre: "ژانر" };

export default function EgoSky({
  graph,
  onSelect,
  actionLabel = "کاوش در گراف",
  mobileTall = false,
  bold = false,
}: {
  graph: EgoGraph | null;
  /** A click (or tap) on a star. The hover card still links to the node's own page. */
  onSelect: (node: EgoNode) => void;
  /** Spoken after each star's name, e.g. "کاوش در گراف". */
  actionLabel?: string;
  /** On phones, draw taller (360:440) with 12px labels instead of a square. */
  mobileTall?: boolean;
  /** Brighter, heavier labels (the home hero). */
  bold?: boolean;
}) {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (!mobileTall) return;
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [mobileTall]);
  const tall = mobileTall && phone;
  const vbY = tall ? -11 : 0;
  const vbH = tall ? 122 : 100;
  const pctY = (y: number) => round2(((y - vbY) / vbH) * 100);
  const [active, setActive] = useState<number | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const placed = useMemo(() => (graph ? layout(graph) : null), [graph]);
  const nodes = placed?.nodes ?? [];
  const edges = placed?.edges ?? [];
  // Only a hovered / focused star dims the rest; at rest every star stays lit.
  const focus = active;

  // A new graph means new indexes; drop whatever was lit on the old one.
  useEffect(() => setActive(null), [graph]);

  const connected = useMemo(() => {
    if (focus === null) return null;
    const set = new Set<number>([focus]);
    edges.forEach((e) => {
      if (e.a === focus) set.add(e.b);
      if (e.b === focus) set.add(e.a);
    });
    return set;
  }, [focus, edges]);

  function show(i: number) {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setActive(i);
  }
  function hideSoon() {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setActive(null), 180);
  }

  // On phones (the tall hero) a tap just acts on the node; no hover card.
  const activeNode = !tall && active !== null ? nodes[active] : null;

  return (
    <div
      className={`relative w-full ${tall ? "aspect-[360/440]" : "aspect-square"}`}
      onMouseLeave={hideSoon}
      // Faint background stars -- decorative, not data (CSS rather than
      // sub-pixel SVG circles, which rasterise as streaks in Chromium).
      style={{
        backgroundImage:
          "radial-gradient(1px 1px at 12% 18%, rgba(242,240,232,.35), transparent), radial-gradient(1px 1px at 82% 12%, rgba(242,240,232,.25), transparent), radial-gradient(1px 1px at 68% 84%, rgba(242,240,232,.3), transparent), radial-gradient(1px 1px at 24% 72%, rgba(242,240,232,.25), transparent), radial-gradient(1px 1px at 91% 58%, rgba(242,240,232,.3), transparent), radial-gradient(1px 1px at 40% 8%, rgba(242,240,232,.2), transparent), radial-gradient(1px 1px at 6% 46%, rgba(242,240,232,.25), transparent), radial-gradient(1px 1px at 55% 96%, rgba(242,240,232,.2), transparent)",
      }}
    >
      <svg viewBox={`0 ${vbY} 100 ${vbH}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
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
          <radialGradient id="rv-core-person" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F2F0E8" />
            <stop offset="60%" stopColor="#4FB8A6" />
            <stop offset="100%" stopColor="#4FB8A6" stopOpacity="0.2" />
          </radialGradient>
        </defs>

        {/* Orbit guides: inner = titles, outer = people and genres */}
        <circle cx="50" cy="50" r={INNER_R} fill="none" stroke="#F2F0E8" strokeOpacity="0.13" strokeWidth="0.15" strokeDasharray="0.6 1.2" />
        <circle cx="50" cy="50" r={OUTER_R} fill="none" stroke="#F2F0E8" strokeOpacity="0.11" strokeWidth="0.15" strokeDasharray="0.6 1.2" />

        <g className="rv-drift" key={graph?.center_id}>
          {edges.map((e, i) => {
            const A = nodes[e.a];
            const B = nodes[e.b];
            const lit = focus !== null && (e.a === focus || e.b === focus);
            const dim = focus !== null && !lit;
            return (
              <path
                key={i}
                d={arcPath(A.x, A.y, B.x, B.y)}
                fill="none"
                strokeLinecap="round"
                pathLength={1}
                className="rv-draw transition-[stroke-opacity] duration-700"
                stroke={e.kind === "credit" ? "#E8B34A" : "#4FB8A6"}
                strokeOpacity={lit ? 0.85 : dim ? 0.05 : 0.4}
                strokeWidth={lit ? 0.35 : 0.2}
                style={{ ["--rv-delay" as string]: `${round2(0.3 + i * 0.07)}s` }}
              />
            );
          })}

          {nodes.map((n, i) => {
            const dim = connected !== null && !connected.has(i);
            const isGenre = n.node.role === "genre";
            const isCenter = i === 0;
            return (
              <g key={n.node.id} className="transition-opacity duration-700" opacity={dim ? 0.3 : 1}>
                {!isGenre && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={round2(n.r * 1.9)}
                    fill={isCenter ? "#E8B34A" : n.node.role === "person" ? "#4FB8A6" : "#9163f5"}
                    className="rv-halo"
                    style={{ ["--rv-delay" as string]: `${round2(hash(n.node.id) * 5)}s`, ["--rv-dur" as string]: `${round2(5 + hash(n.node.slug) * 4)}s` }}
                  />
                )}
                {isGenre ? (
                  <circle cx={n.x} cy={n.y} r={active === i ? round2(n.r * 1.3) : n.r} fill="#070A12" stroke="#4FB8A6" strokeWidth="0.5" className="transition-all duration-700" />
                ) : (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={active === i ? round2(n.r * 1.3) : n.r}
                    fill={isCenter ? "url(#rv-core)" : n.node.role === "person" ? "url(#rv-core-person)" : "url(#rv-core-cool)"}
                    className="transition-all duration-700"
                  />
                )}
                <text
                  x={n.x}
                  y={round2(n.y + (isGenre ? n.r : n.r * 1.9) + 2.6)}
                  fontSize={tall ? (isCenter ? 4.2 : 3.7) : isCenter ? 2.9 : 2.3}
                  fontWeight={isCenter || bold ? 700 : 400}
                  textAnchor="middle"
                  direction={isLatin(nameOf(n.node)) ? "ltr" : "rtl"}
                  fill={focus === i ? "#E8B34A" : isCenter || bold ? "#f1f2fa" : "#B9C0CF"}
                  fillOpacity={focus === i || isCenter || bold ? 1 : n.node.role === "work" ? 0.8 : 0.6}
                  style={{ fontFamily: "var(--font-vazirmatn)" }}
                >
                  {labelOf(n.node, tall ? (isCenter ? 16 : 9) : isCenter ? 22 : 14)}
                </text>
                {roleOf(n.node) && (
                  <text
                    x={n.x}
                    y={round2(n.y + n.r * 1.9 + (isCenter ? 5.6 : 4.9))}
                    fontSize={tall ? 2.9 : 1.8}
                    textAnchor="middle"
                    fill="#8A93A6"
                    fillOpacity={0.85}
                    style={{ fontFamily: "var(--font-vazirmatn)" }}
                  >
                    {roleOf(n.node)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Real, focusable hit targets over the SVG (one per node); the hover card links to its page. */}
      {nodes.map((n, i) => (
        <button
          key={n.node.id}
          type="button"
          aria-label={`${nameOf(n.node)} — ${TYPE_LABEL[n.node.entity_type] ?? ""} — ${actionLabel}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full focus-visible:outline-gold"
          style={{ left: `${n.x}%`, top: `${pctY(n.y)}%`, width: "9%", height: tall ? "7.4%" : "9%", minWidth: 36, minHeight: 36 }}
          onClick={() => {
            // Touch has no hover, so the tap also opens the card (with its page link).
            if (!tall) show(i);
            onSelect(n.node);
          }}
          onMouseEnter={() => !tall && show(i)}
          onMouseLeave={hideSoon}
          onFocus={() => !tall && show(i)}
          onBlur={hideSoon}
        />
      ))}

      {activeNode && <InfoCard node={activeNode} topPct={pctY(activeNode.y)} onEnter={() => show(active!)} onLeave={hideSoon} />}
    </div>
  );
}

function InfoCard({ node, topPct, onEnter, onLeave }: { node: PlacedNode; topPct: number; onEnter: () => void; onLeave: () => void }) {
  const t = node.node;
  const href = detailPathFor(t.entity_type, t.slug) ?? `/movies/${t.slug}`;
  const toLeft = node.x > 50;
  const shiftY = node.y < 30 ? "-12%" : node.y > 70 ? "-88%" : "-50%";
  const name = nameOf(t);
  const role = roleOf(t);

  return (
    <Link
      href={href}
      role="dialog"
      aria-label={name}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="rv-rise absolute z-20 block w-64 rounded-2xl border border-white/10 bg-[#0A0F18]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-md transition hover:border-gold/40 max-md:!inset-x-0 max-md:!bottom-0 max-md:!top-auto max-md:!w-auto max-md:!translate-y-0"
      style={{
        top: `${topPct}%`,
        transform: `translateY(${shiftY})`,
        ...(toLeft ? { right: `calc(${100 - node.x}% + 22px)` } : { left: `calc(${node.x}% + 22px)` }),
      }}
    >
      <div className="flex gap-3">
        {t.entity_type !== "genre" && (
          <div className="relative h-[132px] w-[88px] shrink-0 overflow-hidden rounded-lg bg-surface2">
            {t.image_url ? (
              <Image src={t.image_url} alt="" fill sizes="88px" className="object-cover" />
            ) : (
              <span className="absolute inset-0 bg-gradient-brand opacity-40" />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-gold">{TYPE_LABEL[t.entity_type] ?? ""}</span>
            {t.score !== null && <span className="num text-lg text-ink">{toFaDigits(t.score.toFixed(1))}</span>}
          </div>
          <p className="mt-1 line-clamp-3 text-sm font-medium leading-6 text-ink">{name}</p>
          {role && <p className="text-xs text-muted">{role}</p>}
          {t.year && <p className="num text-right text-xs text-muted">{toFaDigits(t.year)}</p>}
        </div>
      </div>
    </Link>
  );
}

/** The colour key under a sky: what each kind of star and link means. */
export function SkyLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative z-10 mx-auto w-fit max-w-full border border-white/10 backdrop-blur-md ${compact ? "mt-2 rounded-full bg-[#101330]/80 px-5 py-2.5" : "-mt-2 rounded-2xl bg-[#0A0F18]/70 px-4 py-3 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.7)]"}`}>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-ink-dim">
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-gold shadow-[0_0_8px_rgba(232,179,74,0.8)]" /> مرکز
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-violet shadow-[0_0_8px_rgba(145,99,245,0.8)]" /> فیلم / سریال
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-teal shadow-[0_0_8px_rgba(79,184,166,0.8)]" /> هنرمند
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-teal" /> ژانر
        </li>
        {!compact && (
          <li className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-5 rounded bg-gold" /> نقش در اثر
          </li>
        )}
      </ul>
    </div>
  );
}
