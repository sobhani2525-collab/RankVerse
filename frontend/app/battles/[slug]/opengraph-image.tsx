import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPublicBattle } from "@/lib/tournament-server";
import { displayTitle } from "@/lib/title";

export const alt = "نبرد تورنمنتی سینماگزین";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

const FONT_FILE = path.join(process.cwd(), "public", "fonts", "Vazirmatn-Bold.ttf");

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(FONT_FILE);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null; // image still renders; Persian glyphs then depend on the platform fallback
  }
}

function posterUrl(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("/") ? `https://image.tmdb.org/t/p/w342${raw}` : raw;
}

/**
 * satori lays text out left-to-right word by word, so Persian lines come out
 * word-reversed. Each word is its own flex child in a row-reverse container
 * instead, which gives right-to-left word order while letters stay shaped.
 */
function Rtl({ text, size, color = "#F2F0E8", maxWidth, align = "flex-start" }: { text: string; size: number; color?: string; maxWidth?: number; align?: "flex-start" | "center" }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        flexWrap: "wrap",
        justifyContent: align,
        gap: size * 0.28,
        fontSize: size,
        lineHeight: 1.45,
        color,
        ...(maxWidth ? { maxWidth } : {}),
      }}
    >
      {text.split(/\s+/).filter(Boolean).map((word, i) => (
        <span key={i} style={{ display: "flex" }}>{word}</span>
      ))}
    </div>
  );
}

function Poster({ url, label, highlight }: { url: string | null; label: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 260 }}>
      <div
        style={{
          display: "flex",
          width: 260,
          height: 390,
          borderRadius: 16,
          overflow: "hidden",
          border: `4px solid ${highlight ? "#E8B34A" : "#232A42"}`,
          background: "#1A2036",
        }}
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} width={260} height={390} alt="" style={{ objectFit: "cover" }} />
        )}
      </div>
      <div style={{ display: "flex", marginTop: 16 }}>
        <Rtl text={label.length > 22 ? `${label.slice(0, 21)}…` : label} size={26} color="#F2F0E8" maxWidth={260} align="center" />
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [battle, font] = await Promise.all([getPublicBattle(slug), loadFont()]);

  let left = null;
  let right = null;
  let tag = "نبرد تورنمنتی";
  if (battle) {
    if (battle.status === "completed" && battle.winner) {
      left = battle.winner;
      tag = "قهرمان نبرد";
    } else {
      const round = battle.rounds.find((r) => r.round === battle.current_round) ?? battle.rounds[0];
      const match = round?.matches.find((m) => m.entity_a && m.entity_b) ?? null;
      left = match?.entity_a ?? battle.participants[0] ?? null;
      right = match?.entity_b ?? null;
      tag = battle.status === "active" ? "در جریان — رأی بده!" : "نبرد تورنمنتی";
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
          background: "linear-gradient(135deg, #0B0F1A 0%, #12172A 60%, #1A2036 100%)",
          color: "#F2F0E8",
          fontFamily: font ? "Vazirmatn" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
          <Rtl text={tag} size={30} color="#E8B34A" />
          <Rtl text="سینماگزین" size={30} color="#4FB8A6" />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", flex: 1, paddingLeft: 40, maxWidth: 560 }}>
            <Rtl text={battle ? (battle.title.length > 60 ? `${battle.title.slice(0, 59)}…` : battle.title) : "سینماگزین"} size={56} maxWidth={520} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {left && <Poster url={posterUrl(left.poster_url)} label={displayTitle(left)} highlight={!right} />}
            {right && (
              <>
                <span style={{ fontSize: 40, color: "#E8B34A" }}>VS</span>
                <Poster url={posterUrl(right.poster_url)} label={displayTitle(right)} />
              </>
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "Vazirmatn", data: font, weight: 700, style: "normal" }] : undefined,
    }
  );
}
