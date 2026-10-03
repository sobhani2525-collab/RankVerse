import { toFaDigits } from "@/lib/format-number";

/**
 * Draws the 1080x1920 "my champion" story image entirely in the browser
 * (Canvas) -- no server rendering, no extra dependencies. Call it only in
 * response to a user action; the caller caches the result.
 */

export interface StoryCardInput {
  /** TMDb poster path ("/abc.jpg"); the card still renders without it. */
  posterPath: string | null;
  title: string;
  /** Smaller second line, e.g. the English title. */
  subtitle?: string | null;
  themeLine: string;
  /** Consecutive wins; the "N برد پیاپی" line is skipped for 0 or when omitted. */
  streak?: number;
  /** Card heading (default "قهرمان من"). */
  heading?: string;
  /** Replaces the streak line (e.g. "۶۳٪ با من موافق‌اند"). */
  highlight?: string | null;
  /** Call to action above the site name (default "تو هم نبرد کن"). */
  footer?: string;
}

const W = 1080;
const H = 1920;
const SAFE_Y = Math.round(H * 0.15); // keep clear of Instagram's story UI
const GOLD = "#E8B34A";
const INK = "#F2F4FA";
const MUTED = "#9AA3BC";
const SITE = "cinemagozin.ir";

/** The real family string next/font generated for a CSS variable. */
function fontFamily(variable: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.body).getPropertyValue(variable).trim();
    return v ? `${v}, ${fallback}` : fallback;
  } catch {
    return fallback;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
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

function drawPoster(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, title: string, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = "rgba(232,179,74,0.45)";
  ctx.shadowBlur = 70;
  roundRect(ctx, x, y, w, h, 30);
  ctx.fillStyle = "#12172A";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, 30);
  ctx.clip();
  if (img) {
    // cover-fit
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "#1A2036";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = GOLD;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 220px ${fontFamily("--font-lalezar", "Tahoma, sans-serif")}`;
    ctx.fillText(title.trim().charAt(0) || "★", x + w / 2, y + h / 2);
  }
  ctx.restore();

  roundRect(ctx, x, y, w, h, 30);
  ctx.lineWidth = 8;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
}

async function draw(input: StoryCardInput, withPoster: boolean): Promise<Blob> {
  const sans = fontFamily("--font-vazirmatn", "Tahoma, sans-serif");
  const display = fontFamily("--font-lalezar", sans);
  // Without this the canvas silently uses a fallback font before the page's
  // fonts have been fetched.
  await Promise.all([
    document.fonts.load(`800 48px ${sans}`, "قهرمان من"),
    document.fonts.load(`400 48px ${sans}`, "قهرمان من"),
    document.fonts.load(`400 48px ${display}`, "قهرمان من"),
  ]).catch(() => undefined);

  const img = withPoster && input.posterPath ? await loadImage(`https://image.tmdb.org/t/p/w780${input.posterPath}`) : null;

  if (withPoster && input.posterPath && !img) console.warn("story card: poster failed to load, drawing without it");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  drawBackground(ctx);

  // Heading
  ctx.fillStyle = GOLD;
  ctx.font = `400 120px ${display}`;
  ctx.fillText(input.heading ?? "قهرمان من", W / 2, SAFE_Y + 100);

  // Poster
  const pw = 440;
  const ph = 660;
  const px = (W - pw) / 2;
  const py = SAFE_Y + 150;
  drawPoster(ctx, img, input.title, px, py, pw, ph);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Title
  let y = py + ph + 90;
  ctx.fillStyle = INK;
  ctx.font = `800 68px ${sans}`;
  for (const line of wrap(ctx, input.title, W - 200, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 84;
  }
  if (input.subtitle) {
    ctx.direction = "ltr";
    ctx.fillStyle = MUTED;
    ctx.font = `400 42px ${sans}`;
    for (const line of wrap(ctx, input.subtitle, W - 220, 1)) {
      ctx.fillText(line, W / 2, y - 12);
      y += 52;
    }
    ctx.direction = "rtl";
  }

  // Theme + streak
  y += 4;
  ctx.fillStyle = "#A99BFF";
  ctx.font = `400 38px ${sans}`;
  for (const line of wrap(ctx, input.themeLine, W - 200, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 50;
  }
  const highlight = input.highlight ?? (input.streak && input.streak > 0 ? `${toFaDigits(input.streak)} برد پیاپی` : null);
  if (highlight) {
    ctx.fillStyle = GOLD;
    ctx.font = `800 52px ${sans}`;
    ctx.fillText(highlight, W / 2, y + 20);
  }

  // Footer (above the bottom safe margin)
  const footerY = H - SAFE_Y;
  ctx.fillStyle = INK;
  ctx.font = `800 46px ${sans}`;
  ctx.fillText(input.footer ?? "تو هم نبرد کن", W / 2, footerY - 70);
  const logo = await loadImage("/brand-logo.png");
  ctx.direction = "ltr";
  ctx.fillStyle = MUTED;
  ctx.font = `400 38px ${sans}`;
  const siteW = ctx.measureText(SITE).width;
  const logoH = 64;
  const logoW = logo ? (logo.width / logo.height) * logoH : 0;
  const gap = logo ? 20 : 0;
  const startX = (W - (logoW + gap + siteW)) / 2;
  if (logo) ctx.drawImage(logo, startX, footerY - logoH / 2 - 4, logoW, logoH);
  ctx.textAlign = "left";
  ctx.fillText(SITE, startX + logoW + gap, footerY + 22);

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
