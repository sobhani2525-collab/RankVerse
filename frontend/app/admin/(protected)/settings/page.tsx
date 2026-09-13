"use client";
import { useState } from "react";
import { changeAdminPassword } from "@/lib/admin-api";

const MIN_PASSWORD_LENGTH = 12;

export default function AdminSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`رمز جدید باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("رمز جدید و تکرار آن یکسان نیستند");
      return;
    }
    if (newPassword === currentPassword) {
      setError("رمز جدید باید با رمز فعلی متفاوت باشد");
      return;
    }

    setLoading(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در تغییر رمز عبور");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-bold text-ink">تنظیمات حساب</h1>
      <p className="mt-2 text-sm text-muted">تغییر رمز عبور حساب ادمین</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-muted">رمز فعلی</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted">رمز جدید</label>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted">تکرار رمز جدید</label>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            dir="ltr"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-teal/30 bg-teal/5 px-4 py-2 text-sm text-teal">
            رمز عبور با موفقیت تغییر کرد
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
        >
          {loading ? "در حال ذخیره..." : "تغییر رمز عبور"}
        </button>
      </form>
    </div>
  );
}
