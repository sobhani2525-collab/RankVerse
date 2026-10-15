import { avatarByKey } from "@/lib/avatars";

export function UserAvatar({ avatarKey, name, size = 36 }: { avatarKey: string | null; name: string; size?: number }) {
  const avatar = avatarByKey(avatarKey);
  const style = {
    width: size,
    height: size,
    fontSize: size * 0.5,
    ...(avatar ? { backgroundImage: `linear-gradient(135deg, ${avatar.from}, ${avatar.to})` } : {}),
  };
  return (
    <span
      aria-hidden
      style={style}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface2 font-bold text-muted"
    >
      {avatar ? avatar.glyph : name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
