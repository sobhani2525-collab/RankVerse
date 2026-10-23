import { proxyTmdbUrl } from "./tmdb-image-url";
import { toFaDigits } from "@/lib/format-number";

/**
 * Draws the 1080x1920 battle story image entirely in the browser (Canvas) --
 * no server rendering, no extra dependencies. Call it only in response to a
 * user action; the caller caches the result.
 */

export interface StoryCardInput {
  /** TMDb poster path ("/abc.jpg"); the card still renders without it. */
  posterPath: string | null;
  title: string;
  /** Smaller second line, e.g. the English title. */
  subtitle?: string | null;
  /** Card heading ("نبرد فیلم‌های برگزیده"). */
  heading: string;
  /** Line under the heading that says what this card is. */
  themeLine: string;
  year?: number | null;
  /** "کارگردان" / "سازنده" and the person's name. */
  credit?: { label: string; name: string } | null;
  /** Pill on the poster's top edge (e.g. "برنده"). */
  posterBadge?: string | null;
  /** Gold line under the credits (e.g. "۶۳٪ با من موافق‌اند"). */
  highlight?: string | null;
  /** "How it's played" steps; the box is skipped when omitted. */
  steps?: string[];
  stepsTitle?: string;
  /** Call to action above the site name (default "تو هم نبرد کن"). */
  footer?: string;
}

const W = 1080;
const H = 1920;
const SIDE = 90;
const GOLD = "#E9B949";
const INK = "#F4F1EA";
const MUTED = "#A7ACBA";
const DARK = "#14110A";
const SITE = "cinemagozin.ir";

// Lucide-style 24x24 stroke icons.
const SWORDS = ["M14.5 17.5L3 6V3h3l11.5 11.5", "M13 19l6-6", "M16 16l4 4", "M19 21l2-2", "M9.5 6.5L18 3h3v3l-3.5 8.5", "M5 14l4 4", "M7 17l-3 3"];
const TROPHY = ["M8 21h8", "M12 17v4", "M7 4h10v5a5 5 0 0 1-10 0V4z", "M17 5h3v2a3 3 0 0 1-3 3", "M7 5H4v2a3 3 0 0 0 3 3"];

/** The real family string next/font generated for a CSS variable. */
function fontFamily(variable: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.body).getPropertyValue(variable).trim();
    return v ? `${v}, ${fallback}` : fallback;
  } catch {
    return fallback;
  }
}

const IMAGE_TIMEOUT_MS = 10_000;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

const PRIMARY_MIRROR = (process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE || "").replace(/\/+$/, "");
const FALLBACK_MIRROR = (process.env.NEXT_PUBLIC_TMDB_IMAGE_FALLBACK_BASE || "").replace(/\/+$/, "");

const FALLBACK_HEAD_START_MS = 2500;

// w500 covers the poster's drawn width (<= 380px); proxyTmdbUrl caps it to
// the size the page's posters already use, so it is usually in the browser
// cache (see MAX_MIRROR_WIDTH in tmdb-image-url.ts). The primary
// mirror can stall or cut big downloads off on some VPN paths, so (like
// TmdbImageFallback does for the page) the fallback mirror joins in when the
// primary fails or is still loading after a short head start; first one wins.
function loadPoster(posterPath: string): Promise<HTMLImageElement | null> {
  const src = proxyTmdbUrl(`https://image.tmdb.org/t/p/w500${posterPath}`);
  if (!PRIMARY_MIRROR || !FALLBACK_MIRROR || !src.startsWith(`${PRIMARY_MIRROR}/`)) return loadImage(src);
  const fallbackSrc = FALLBACK_MIRROR + src.slice(PRIMARY_MIRROR.length);
  return new Promise((resolve) => {
    let pending = 2;
    let fallbackStarted = false;
    const settle = (img: HTMLImageElement | null) => {
      pending -= 1;
      if (img) resolve(img);
      else if (pending === 0) resolve(null);
    };
    const startFallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      void loadImage(fallbackSrc).then(settle);
    };
    const timer = window.setTimeout(startFallback, FALLBACK_HEAD_START_MS);
    void loadImage(src).then((img) => {
      window.clearTimeout(timer);
      if (!img) startFallback();
      settle(img);
    });
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawIcon(ctx: CanvasRenderingContext2D, paths: string[], x: number, y: number, size: number, color: string, stroke: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of paths) ctx.stroke(new Path2D(p));
  ctx.restore();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#070A12";
  ctx.fillRect(0, 0, W, H);
  glow(ctx, 160, 380, 820, "rgba(145,99,245,0.42)");
  glow(ctx, 980, 1500, 860, "rgba(79,184,166,0.30)");
  glow(ctx, W / 2, 800, 520, "rgba(233,185,73,0.10)");
  // Deterministic little stars so the same result always looks the same.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.25 + rnd() * 0.6;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Poster in an 8px gold frame; (x, y, w, h) is the frame's outer box. */
function drawPoster(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, title: string, display: string, x: number, y: number, w: number, h: number) {
  const frame = ctx.createLinearGradient(x, y, x + w, y + h);
  frame.addColorStop(0, "#F5D27A");
  frame.addColorStop(1, "#C8912B");
  ctx.save();
  ctx.shadowColor = "rgba(233,185,73,0.35)";
  ctx.shadowBlur = 80;
  roundRect(ctx, x, y, w, h, 28);
  ctx.fillStyle = frame;
  ctx.fill();
  ctx.restore();

  const ix = x + 8;
  const iy = y + 8;
  const iw = w - 16;
  const ih = h - 16;
  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, 20);
  ctx.clip();
  if (img) {
    // cover-fit
    const scale = Math.max(iw / img.width, ih / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "#1A2036";
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = GOLD;
    ctx.textAlign = "center";
    ctx.font = `400 200px ${display}`;
    ctx.fillText(title.trim().charAt(0) || "★", ix + iw / 2, iy + ih / 2);
  }
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, text: string, sans: string, cx: number, top: number) {
  ctx.font = `900 28px ${sans}`;
  const icon = 30;
  const gap = 10;
  const tw = ctx.measureText(text).width;
  const w = 26 * 2 + icon + gap + tw;
  const h = 56;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, cx - w / 2, top, w, h, h / 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.restore();
  const right = cx + w / 2 - 26;
  drawIcon(ctx, TROPHY, right - icon, top + (h - icon) / 2, icon, DARK, 2.2);
  ctx.fillStyle = DARK;
  ctx.textAlign = "right";
  ctx.fillText(text, right - icon - gap, top + h / 2 + 2);
}

/** "۲۰۱۰ • کارگردان: عباس کیارستمی", laid out right to left. */
function drawMeta(ctx: CanvasRenderingContext2D, sans: string, year: string | null, credit: StoryCardInput["credit"], cy: number) {
  type Part = { text: string; weight: number } | "dot";
  const parts: Part[] = [];
  if (year) parts.push({ text: year, weight: 700 });
  if (year && credit) parts.push("dot");
  if (credit) parts.push({ text: `${credit.label}: `, weight: 400 }, { text: credit.name, weight: 700 });
  if (!parts.length) return;

  let size = 32;
  const dotW = 10 + 2 * 20;
  const widthAt = (s: number) =>
    parts.reduce((sum, p) => {
      if (p === "dot") return sum + dotW;
      ctx.font = `${p.weight} ${s}px ${sans}`;
      return sum + ctx.measureText(p.text).width;
    }, 0);
  while (size > 22 && widthAt(size) > W - 2 * SIDE) size -= 2;

  let x = (W + widthAt(size)) / 2;
  ctx.textAlign = "right";
  ctx.fillStyle = "#D9D5CC";
  for (const p of parts) {
    if (p === "dot") {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(x - dotW / 2, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#D9D5CC";
      x -= dotW;
      continue;
    }
    ctx.font = `${p.weight} ${size}px ${sans}`;
    ctx.fillText(p.text, x, cy);
    x -= ctx.measureText(p.text).width;
  }
}

function drawSteps(ctx: CanvasRenderingContext2D, sans: string, title: string, steps: string[], top: number) {
  const boxW = W - 2 * SIDE;
  const h = 218;
  roundRect(ctx, SIDE, top, boxW, h, 28);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `700 28px ${sans}`;
  ctx.fillText(title, W / 2, top + 45);

  // Each column is as wide as its text plus an even share of what's left, so
  // a longer step never wraps.
  const inner = boxW - 40;
  const gap = 18;
  let size = 27;
  const widths = () => {
    ctx.font = `400 ${size}px ${sans}`;
    return steps.map((s) => ctx.measureText(s).width);
  };
  let ws = widths();
  while (size > 18 && ws.reduce((a, b) => a + b, 0) + gap * (steps.length - 1) > inner) {
    size -= 1;
    ws = widths();
  }
  const free = (inner - ws.reduce((a, b) => a + b, 0) - gap * (steps.length - 1)) / steps.length;
  let right = SIDE + boxW - 20;
  steps.forEach((step, i) => {
    const colW = ws[i] + free;
    const cx = right - colW / 2;
    const last = i === steps.length - 1;
    ctx.fillStyle = last ? "rgba(233,185,73,0.22)" : "rgba(185,174,245,0.18)";
    ctx.beginPath();
    ctx.arc(cx, top + 116, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = last ? GOLD : "#CFC6FF";
    ctx.font = `900 30px ${sans}`;
    ctx.fillText(toFaDigits(i + 1), cx, top + 118);
    ctx.fillStyle = INK;
    ctx.font = `400 ${size}px ${sans}`;
    ctx.fillText(step, cx, top + 175);
    right -= colW + gap;
  });
}

async function draw(input: StoryCardInput, withPoster: boolean): Promise<Blob> {
  const sans = fontFamily("--font-vazirmatn", "Tahoma, sans-serif");
  const display = fontFamily("--font-lalezar", sans);
  // Without this the canvas silently uses a fallback font before the page's
  // fonts have been fetched.
  await Promise.all(
    [`900 48px ${sans}`, `700 48px ${sans}`, `400 48px ${sans}`, `400 48px ${display}`].map((f) => document.fonts.load(f, input.heading))
  ).catch(() => undefined);

  const [img, logo] = await Promise.all([
    withPoster && input.posterPath ? loadPoster(input.posterPath) : Promise.resolve(null),
    loadImage("/brand-logo.png"),
  ]);
  if (withPoster && input.posterPath && !img) console.warn("story card: poster failed to load, drawing without it");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  drawBackground(ctx);

  // Logo
  let y = 100;
  if (logo) {
    const lw = 240;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh;
  }

  // Heading: swords icon + gold title
  y += 44;
  ctx.font = `900 76px ${sans}`;
  const icon = 64;
  const iconGap = 18;
  const headW = Math.min(ctx.measureText(input.heading).width, W - 2 * SIDE - icon - iconGap);
  const headRight = (W + icon + iconGap + headW) / 2;
  drawIcon(ctx, SWORDS, headRight - icon, y + 12, icon, GOLD, 1.8);
  ctx.fillStyle = GOLD;
  ctx.textAlign = "right";
  ctx.fillText(input.heading, headRight - icon - iconGap, y + 46, headW);
  ctx.textAlign = "center";
  y += 88 + 18;

  // What this card is
  ctx.fillStyle = "#C9C5D6";
  ctx.font = `400 34px ${sans}`;
  for (const line of wrap(ctx, input.themeLine, W - 2 * SIDE - 60, 2)) {
    ctx.fillText(line, W / 2, y + 26);
    y += 51;
  }

  // Footer, from the bottom up: site, call to action, steps
  let bottom = H - 160;
  ctx.direction = "ltr";
  ctx.fillStyle = MUTED;
  ctx.font = `400 32px ${sans}`;
  ctx.fillText(SITE, W / 2, bottom - 22);
  ctx.direction = "rtl";
  bottom -= 45 + 14;

  const cta = input.footer ?? "تو هم نبرد کن";
  ctx.font = `900 40px ${sans}`;
  const ctaW = ctx.measureText(cta).width + 120;
  roundRect(ctx, (W - ctaW) / 2, bottom - 96, ctaW, 96, 48);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.fillStyle = DARK;
  ctx.fillText(cta, W / 2, bottom - 46);
  bottom -= 96 + 36;

  if (input.steps?.length) {
    drawSteps(ctx, sans, input.stepsTitle ?? "چطور بازی می‌شود؟", input.steps, bottom - 218);
    bottom -= 218;
  }
  bottom -= 50;

  // Middle: poster, then title and credits; the poster shrinks if it would
  // run into the footer.
  ctx.font = `900 64px ${sans}`;
  const titleLines = wrap(ctx, input.title, W - 2 * SIDE, 2);
  const year = input.year ? toFaDigits(input.year) : null;
  const hasMeta = Boolean(year || input.credit);
  const textH = 36 + titleLines.length * 77 + (input.subtitle ? 44 : 0) + (hasMeta ? 59 : 0) + (input.highlight ? 78 : 0);
  const posterTop = y + 56;
  const ph = Math.max(320, Math.min(572, bottom - posterTop - 16 - textH));
  const pw = Math.round((ph * 380) / 572);
  drawPoster(ctx, img, input.title, display, (W - pw - 16) / 2, posterTop, pw + 16, ph + 16);
  if (input.posterBadge) drawBadge(ctx, input.posterBadge, sans, W / 2, posterTop - 26);
  ctx.textAlign = "center";

  y = posterTop + ph + 16 + 36;
  ctx.fillStyle = INK;
  ctx.font = `900 64px ${sans}`;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y + 38);
    y += 77;
  }
  if (input.subtitle) {
    ctx.direction = "ltr";
    ctx.fillStyle = MUTED;
    ctx.font = `400 36px ${sans}`;
    ctx.fillText(wrap(ctx, input.subtitle, W - 2 * SIDE, 1)[0] ?? "", W / 2, y + 23);
    ctx.direction = "rtl";
    y += 44;
  }
  if (hasMeta) {
    drawMeta(ctx, sans, year, input.credit, y + 14 + 22);
    ctx.textAlign = "center";
    y += 59;
  }
  if (input.highlight) {
    ctx.fillStyle = GOLD;
    ctx.font = `800 44px ${sans}`;
    ctx.fillText(input.highlight, W / 2, y + 18 + 30);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

/**
 * Renders the card. If the poster can't be used (CDN blocked, or CORS taints
 * the canvas so export throws) the card is built again without it instead of
 * failing.
 */
export async function renderStoryCard(input: StoryCardInput): Promise<Blob> {
  try {
    return await draw(input, true);
  } catch (e) {
    console.warn("story card: rendering with the poster failed, retrying without it", e);
    return draw(input, false);
  }
}
