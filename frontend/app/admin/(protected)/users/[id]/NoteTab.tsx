"use client";
import { useEffect, useState, type MutableRefObject } from "react";
import { adminUsersCall, type AdminUserDetail } from "@/lib/admin-users";
import { toFaDigits } from "@/lib/format-number";
import { useToast } from "../../_components/Toast";

const MAX = 5000;

export function NoteTab({
  user,
  onSaved,
  dirtyRef,
}: {
  user: AdminUserDetail;
  onSaved: () => Promise<void>;
  dirtyRef: MutableRefObject<boolean>;
}) {
  const toast = useToast();
  const saved = user.admin_note ?? "";
  const [text, setText] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = text.trim() !== saved.trim();

  useEffect(() => {
    dirtyRef.current = dirty;
    return () => {
      dirtyRef.current = false;
    };
  }, [dirty, dirtyRef]);

  async function save() {
    setSaving(true);
    try {
      await adminUsersCall(`/${user.id}`, { method: "PATCH", body: JSON.stringify({ admin_note: text.trim() }) });
      dirtyRef.current = false;
      toast({ text: "یادداشت ذخیره شد" });
      await onSaved();
    } catch (err) {
      toast({ ok: false, text: err instanceof Error ? err.message : "ذخیره نشد" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-3 rounded-xl border border-border bg-surface p-5">
      <p className="text-xs text-muted">این یادداشت فقط برای ادمین‌ها دیده می‌شود و هرگز به کاربر یا سایت عمومی نمی‌رسد.</p>
      <textarea
        aria-label="یادداشت داخلی ادمین"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX}
        rows={8}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-7 text-ink focus:border-gold/50 focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="rounded-lg border border-gold/50 bg-gold/10 px-5 py-2 text-sm font-bold text-gold hover:bg-gold/20 disabled:opacity-40">
          {saving ? "در حال ذخیره…" : "ذخیرهٔ یادداشت"}
        </button>
        {dirty && <span className="text-xs text-gold">تغییرات ذخیره‌نشده</span>}
        <span className="num ms-auto text-xs text-muted">{toFaDigits(text.length)} / {toFaDigits(MAX)}</span>
      </div>
    </div>
  );
}
