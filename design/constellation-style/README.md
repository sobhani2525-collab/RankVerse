# Constellation theme — drop-in for the RankVerse Next.js app

Matches the design canvas (Home / Movie detail / List / Battle) in
Persian RTL, dark navy background, violet→teal gradient accents.

## Files
- `tailwind.config.ts` — color tokens (`bg`, `surface`, `surface-2`,
  `border`, `border-soft`, `ink`, `ink-dim`, `muted`, `violet`,
  `violet-soft`, `teal`, `gold`) + font families (`font-sans`,
  `font-mono`, `font-display`). Merge into your existing config —
  it only *adds* `violet` and the `display` font stack if you
  already have the rest.
- `app/fonts.ts` — `next/font/google` setup for Vazirmatn (body),
  IBM Plex Mono (numbers/scores/dates), Lalezar (headings only).
- `app/layout.snippet.tsx` — shows where the font variables attach
  on `<html>`.
- `app/globals.constellation.css` — utility classes used across the
  mockups: `.font-display`, `.gradient-text`, `.btn-primary`,
  `.btn-secondary`, `.score-ring`, `.live-dot`.

## Usage examples
```tsx
<h1 className="font-display text-4xl">میان‌ستاره‌ای</h1>
<span className="font-mono">9.1</span>
<a className="btn-primary">شروع نبرد</a>
<div className="score-ring" style={{ "--score-pct": "82%" } as React.CSSProperties} />
```

## Note on Lalezar
It's a single-weight, heavy display face — great for `h1`/`h2` and
the wordmark, not for body copy, chips, or long labels (readability
drops and there's no weight to lean on for hierarchy). Vazirmatn
stays the workhorse everywhere else.
