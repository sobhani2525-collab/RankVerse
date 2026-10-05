"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateMyProfile } from "@/lib/api";
import { AVATARS } from "@/lib/avatars";
import { toFaDigits } from "@/lib/format-number";

const NAME_MAX = 50;
const BIO_MAX = 300;

/** Inline editor for display name, bio and preset avatar on the signed-in user's profile. */
export default function ProfileEditor({ onDone }: { onDone: () => void }) {
  const { user, getToken, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarKey, setAvatarKey] = useState<string | null>(user?.avatar_key ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      // Blank text clears the field server-side.
      await updateMyProfile(token, { display_name: displayName, bio, avatar_key: avatarKey });
      await refreshUser();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیرهٔ پروفایل ممکن نشد");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50";

  return (
    <form onSubmit={save} className="mt-8 max-w-2xl rounded-2xl border border-border bg-surface/60 p-5 sm:p-6">
      <fieldset>
        <legend className="mb-3 text-sm text-muted">آواتار</legend>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="آواتار">
          <button
            type="button"
            role="radio"
            aria-checked={avatarKey === null}
            onClick={() => setAvatarKey(null)}
            className={`flex h-12 w-12 items-center justify-center rounded-full border text-xs transition ${
              avatarKey === null ? "border-gold text-gold" : "border-border text-muted hover:border-gold/40"
            }`}
          >
            حرف
          </button>
          {AVATARS.map((a) => (
            <button
              key={a.key}
              type="button"
              role="radio"
              aria-checked={avatarKey === a.key}
              aria-label={a.label}
              title={a.label}
              onClick={() => setAvatarKey(a.key)}
              style={{ backgroundImage: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition ${
                avatarKey === a.key ? "ring-2 ring-gold ring-offset-2 ring-offset-bg" : "opacity-80 hover:opacity-100"
              }`}
            >
              {a.glyph}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <label htmlFor="profile-display-name" className="mb-1 block text-sm text-muted">
          نام نمایشی
        </label>
        <input
          id="profile-display-name"
          value={displayName}
          maxLength={NAME_MAX}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={user?.username}
          className={field}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="profile-bio" className="mb-1 block text-sm text-muted">
          دربارهٔ من
        </label>
        <textarea
          id="profile-bio"
          value={bio}
          maxLength={BIO_MAX}
          rows={3}
          onChange={(e) => setBio(e.target.value)}
          placeholder="چند کلمه دربارهٔ سلیقهٔ سینمایی‌ات…"
          className={field}
        />
        <p className="mt-1 text-left text-xs text-muted" dir="ltr">
          {toFaDigits(bio.length)} / {toFaDigits(BIO_MAX)}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-3">
        <button type="submit" disabled={saving} className="rounded-lg bg-gold px-5 py-2 text-sm font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50">
          {saving ? "در حال ذخیره…" : "ذخیره"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-border px-5 py-2 text-sm text-muted transition hover:text-ink">
          انصراف
        </button>
      </div>
    </form>
  );
}
