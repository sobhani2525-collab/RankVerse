"use client";
import { useEffect, useState, type MutableRefObject } from "react";
import { adminUsersCall, type AdminUserDetail } from "@/lib/admin-users";
import { useToast } from "../../_components/Toast";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const input = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

interface Form {
  display_name: string;
  bio: string;
  username: string;
  email: string;
}

const fromUser = (u: AdminUserDetail): Form => ({
  display_name: u.display_name ?? "",
  bio: u.bio ?? "",
  username: u.username,
  email: u.email,
});

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (f.display_name.trim().length > 50) errors.display_name = "حداکثر ۵۰ نویسه";
  if (f.bio.trim().length > 300) errors.bio = "حداکثر ۳۰۰ نویسه";
  const username = f.username.trim();
  if (username.length < 3 || username.length > 50) errors.username = "نام کاربری باید ۳ تا ۵۰ نویسه باشد";
  if (!EMAIL_RE.test(f.email.trim())) errors.email = "ایمیل معتبر نیست";
  return errors;
}

export function EditTab({
  user,
  onSaved,
  dirtyRef,
}: {
  user: AdminUserDetail;
  onSaved: () => Promise<void>;
  dirtyRef: MutableRefObject<boolean>;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(() => fromUser(user));
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const original = fromUser(user);
  const changedKeys = (Object.keys(form) as (keyof Form)[]).filter((k) => form[k].trim() !== original[k].trim());
  const errors = validate(form);
  const canSave = changedKeys.length > 0 && Object.keys(errors).length === 0 && !saving;

  useEffect(() => {
    dirtyRef.current = changedKeys.length > 0;
    return () => {
      dirtyRef.current = false;
    };
  }, [changedKeys.length, dirtyRef]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setServerError(null);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setServerError(null);
    const body = Object.fromEntries(changedKeys.map((k) => [k, form[k].trim()]));
    try {
      await adminUsersCall(`/${user.id}`, { method: "PATCH", body: JSON.stringify(body) });
      dirtyRef.current = false;
      toast({ text: "تغییرات ذخیره شد" });
      await onSaved();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "ذخیره نشد");
    } finally {
      setSaving(false);
    }
  }

  const Err = ({ k }: { k: keyof Form }) => (errors[k] && form[k] !== original[k] ? <p className="mt-1 text-xs text-red-400">{errors[k]}</p> : null);

  return (
    <form onSubmit={save} className="max-w-xl space-y-4 rounded-xl border border-border bg-surface p-5">
      {user.status === "deleted" && <p className="text-xs text-gold">این کاربر حذف شده است؛ ویرایش مجاز است.</p>}
      <label className="block text-sm text-muted">
        نام نمایشی
        <input value={form.display_name} onChange={set("display_name")} maxLength={60} className={input} />
        <Err k="display_name" />
      </label>
      <label className="block text-sm text-muted">
        نام کاربری
        <input dir="ltr" value={form.username} onChange={set("username")} maxLength={60} className={`${input} text-start`} />
        <Err k="username" />
      </label>
      <label className="block text-sm text-muted">
        ایمیل
        <input dir="ltr" type="email" value={form.email} onChange={set("email")} className={`${input} text-start`} />
        <Err k="email" />
        {form.email.trim() !== original.email && user.email_verified && (
          <p className="mt-1 text-xs text-gold">با تغییر ایمیل، وضعیت «تأیید شده» پاک می‌شود.</p>
        )}
      </label>
      <label className="block text-sm text-muted">
        بیوگرافی
        <textarea value={form.bio} onChange={set("bio")} rows={4} maxLength={320} className={input} />
        <Err k="bio" />
      </label>

      {serverError && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{serverError}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSave} className="rounded-lg border border-gold/50 bg-gold/10 px-5 py-2 text-sm font-bold text-gold hover:bg-gold/20 disabled:opacity-40">
          {saving ? "در حال ذخیره…" : "ذخیره"}
        </button>
        <button type="button" disabled={changedKeys.length === 0 || saving} onClick={() => setForm(fromUser(user))} className="text-sm text-muted hover:text-ink disabled:opacity-40">
          بازنشانی
        </button>
        {changedKeys.length > 0 && <span className="text-xs text-gold">تغییرات ذخیره‌نشده</span>}
      </div>
    </form>
  );
}
