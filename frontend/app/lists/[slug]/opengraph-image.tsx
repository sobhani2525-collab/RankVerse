import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { ImageResponse } from "next/og";
import { getListBySlug } from "@/lib/api";

// Node's global fetch (undici) does NOT automatically honor
// HTTP_PROXY/HTTPS_PROXY env vars the way curl and browsers do -- on a
// network that routes external hosts (like image.tmdb.org) through a
// proxy, plain fetch() fails with ECONNREFUSED against whatever the
// proxy's DNS entry resolves to, even though the proxy itself works
// fine. EnvHttpProxyAgent replicates curl's behavior exactly, including
// respecting NO_PROXY (so local backend calls to localhost are
// untouched). This is a no-op when no proxy is configured, which is the
// case in production on Cloudflare Workers.
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

// @opennextjs/cloudflare shims out Next's Edge Runtime entirely (it only
// supports the Node.js runtime, bundled to run on workerd via
// nodejs_compat — see wrangler.jsonc). So this must NOT set
// `export const runtime = "edge"` like typical next/og examples do;
// next/og's ImageResponse already falls back to its Node.js build
// (next/dist/compiled/@vercel/og/index.node.js) whenever NEXT_RUNTIME
// isn't "edge", which is exactly what we want here.
export const runtime = "nodejs";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same palette as tailwind.config.ts (this renders outside Tailwind, via
// Satori, so colors have to be inlined instead of using className).
const COLORS = {
  bg: "#0B0F1A",
  surface: "#12172A",
  surface2: "#1A2036",
  border: "#232A42",
  gold: "#E8B34A",
  teal: "#4FB8A6",
  ink: "#F2F0E8",
  muted: "#8A93A6",
};

const POSTER_BASE = "https://image.tmdb.org/t/p/w200";

// Satori (next/og's renderer) doesn't implement the Unicode Bidi
// Algorithm within a single text node: a pure-Persian string shapes and
// orders correctly on its own, but splicing a digit run into RTL text
// (e.g. list titles like "5 فیلم برتر اکشن") gets rendered with runs
// concatenated in literal source order instead of RTL reading order.
// Bidi isolate control characters (RLI/PDI) do NOT work around this --
// they crash Satori's renderer entirely, and reversing the *string*
// doesn't survive Satori's own line-wrapping either (tried both).
//
// The fix that actually works: split into words, reverse the array, and
// render each word as its own flex child in a single no-wrap row with
// `direction: ltr` (see the title/stats JSX below) -- so the *array
// order* IS the literal left-to-right pixel order, which then reads
// correctly right-to-left. Each word is single-script so it always
// shapes correctly on its own regardless of position.
function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

// Loads a Vazirmatn subset covering only the characters actually used in
// this image, as ArrayBuffer TTF data -- Satori (next/og's render engine)
// needs real font bytes, it can't use next/font's <link> based fonts.
// Requesting with `text=` also makes Google's CSS API return a
// format('truetype') source instead of woff2, which Satori requires.
async function loadVazirmatnBold(text: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Vazirmatn:wght@700&text=${encodeURIComponent(text)}`;
  const cssRes = await fetch(cssUrl, { next: { revalidate: 86400 } });
  const css = await cssRes.text();
  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
  if (!match) throw new Error("Vazirmatn font source not found in Google Fonts CSS");

  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

function fallbackImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.surface2} 100%)`,
        }}
      >
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, color: COLORS.gold }}>
          RankVerse
        </div>
      </div>
    ),
    size
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const detail = await getListBySlug(slug);

    const posterUrls = detail.items
      .slice(0, 4)
      .map((item) => item.entity.poster_path)
      .filter((p): p is string => Boolean(p))
      .map((p) => `${POSTER_BASE}${p}`);

    // Reversed once, rendered as a single no-wrap line in literal
    // left-to-right flex order (direction: ltr below) -- reads correctly
    // right-to-left. Font size scales down for longer titles since this
    // is a single line with no text-wrapping fallback (see splitWords
    // above for why per-line RTL wrapping isn't used here).
    const titleWords = splitWords(detail.title).reverse();
    const titleFontSize =
      detail.title.length <= 20 ? 54 : detail.title.length <= 35 ? 40 : detail.title.length <= 50 ? 30 : 24;
    const owner = detail.owner_username ? `@${detail.owner_username}` : "RankVerse";
    // Left-to-right flex order: آیتم, count -- reads correctly
    // right-to-left as "<count> آیتم".
    const statsParts = ["آیتم", String(detail.items.length)];
    const brand = "RankVerse";

    const fontText = Array.from(
      new Set(Array.from(titleWords.join("") + owner + statsParts.join("") + brand))
    ).join("");
    const vazirBold = await loadVazirmatnBold(fontText);

    // Spread the poster collage like cards fanned out on a table: each
    // poster absolutely positioned with a slight overlap and rotation.
    const collageOffsets = [
      { left: 0, top: 60, rotate: -8 },
      { left: 90, top: 10, rotate: 4 },
      { left: 180, top: 70, rotate: -3 },
      { left: 270, top: 20, rotate: 7 },
    ];

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            background: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.surface2} 100%)`,
            fontFamily: "Vazirmatn",
          }}
        >
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 70px",
            }}
          >
            <div style={{ display: "flex", position: "relative", width: 480, height: 400 }}>
              {posterUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  width={220}
                  height={330}
                  style={{
                    position: "absolute",
                    left: collageOffsets[i].left,
                    top: collageOffsets[i].top,
                    borderRadius: 14,
                    border: `4px solid ${COLORS.surface}`,
                    objectFit: "cover",
                    transform: `rotate(${collageOffsets[i].rotate}deg)`,
                  }}
                />
              ))}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                textAlign: "right",
                direction: "rtl",
                maxWidth: 600,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  direction: "ltr",
                  justifyContent: "flex-end",
                  gap: 14,
                  fontSize: titleFontSize,
                  fontWeight: 700,
                  color: COLORS.ink,
                }}
              >
                {titleWords.map((word, i) => (
                  <div key={i} style={{ display: "flex" }}>
                    {word}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: COLORS.teal }}>
                {owner}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  direction: "ltr",
                  gap: 8,
                  marginTop: 14,
                  fontSize: 26,
                  color: COLORS.muted,
                }}
              >
                {statsParts.map((part, i) => (
                  <div key={i} style={{ display: "flex" }}>
                    {part}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", paddingBottom: 36 }}>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: COLORS.gold }}>
              {brand}
            </div>
          </div>
        </div>
      ),
      {
        ...size,
        fonts: [{ name: "Vazirmatn", data: vazirBold, weight: 700, style: "normal" }],
      }
    );
  } catch {
    return fallbackImage();
  }
}
