/**
 * Preset avatars (the site has no file storage). The keys must match
 * PROFILE_AVATAR_KEYS in app/modules/users/schemas.py.
 */
export interface PresetAvatar {
  key: string;
  glyph: string;
  label: string;
  from: string;
  to: string;
}

export const AVATARS: PresetAvatar[] = [
  { key: "a1", glyph: "🎬", label: "کلاکت", from: "#E8B34A", to: "#9A5B13" },
  { key: "a2", glyph: "🍿", label: "ذرت بوداده", from: "#F2C14E", to: "#B5532E" },
  { key: "a3", glyph: "🎭", label: "نمایش", from: "#9163F5", to: "#3D2A8C" },
  { key: "a4", glyph: "🎞️", label: "نوار فیلم", from: "#4FB8A6", to: "#1E5C57" },
  { key: "a5", glyph: "📽️", label: "پروژکتور", from: "#6B7A99", to: "#2A3350" },
  { key: "a6", glyph: "🌌", label: "کهکشان", from: "#6C4BD1", to: "#0F1A44" },
  { key: "a7", glyph: "⭐", label: "ستاره", from: "#F5D76E", to: "#C77A1A" },
  { key: "a8", glyph: "🦉", label: "جغد", from: "#8D6E63", to: "#3E2C26" },
  { key: "a9", glyph: "🐺", label: "گرگ", from: "#78909C", to: "#263238" },
  { key: "a10", glyph: "🦊", label: "روباه", from: "#FF8A50", to: "#9C3D12" },
  { key: "a11", glyph: "🐙", label: "هشت‌پا", from: "#C06C9E", to: "#5B2A59" },
  { key: "a12", glyph: "🚀", label: "موشک", from: "#5AA9F0", to: "#1B3A6B" },
];

const BY_KEY = new Map(AVATARS.map((a) => [a.key, a]));

export function avatarByKey(key: string | null | undefined): PresetAvatar | null {
  return key ? (BY_KEY.get(key) ?? null) : null;
}
