"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type GoogleId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};

function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const render = () => {
      const gid = (window as unknown as { google?: { accounts: { id: GoogleId } } }).google?.accounts.id;
      if (!gid || !ref.current) return;
      gid.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential) });
      const width = Math.min(400, Math.max(200, Math.round(ref.current.parentElement?.clientWidth ?? 320)));
      gid.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        logo_alignment: "center",
        locale: "fa",
        width,
      });
    };
    if ((window as unknown as { google?: unknown }).google) {
      render();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={ref} className="flex min-h-[44px] justify-center overflow-hidden rounded-lg" dir="ltr" />;
}

export default function LoginForm({
  onSuccess,
  submitLabel = "ورود",
}: {
  onSuccess: () => void;
  submitLabel?: string;
}) {
  const { login, loginGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim() || !password) {
      setError("ایمیل و رمز عبور را وارد کنید");
      return;
    }
    if (!isValidEmail(email)) {
      setError("ایمیل وارد شده معتبر نیست");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ایمیل یا رمز عبور اشتباه است");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(credential: string) {
    setError(null);
    try {
      await loginGoogle(credential);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ورود با گوگل ناموفق بود");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm text-muted">ایمیل</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
          dir="ltr"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-muted">رمز عبور</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
          dir="ltr"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
      >
        {loading ? "در حال ورود..." : submitLabel}
      </button>

      {GOOGLE_CLIENT_ID && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            یا
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton onCredential={handleGoogle} />
        </>
      )}
    </form>
  );
}
