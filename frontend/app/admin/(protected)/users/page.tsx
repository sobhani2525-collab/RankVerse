import { Suspense } from "react";
import { AdminUsersManager } from "./AdminUsersManager";

export default function AdminUsersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">کاربران و جامعه</h1>
      <p className="mt-2 text-sm text-muted">
        جستجو و مدیریت کاربران: مسدودسازی، حذف نرم (قابل بازیابی)، تأیید ایمیل و ارسال لینک بازیابی رمز. همهٔ عملیات در تاریخچهٔ مدیریتی ثبت می‌شود.
      </p>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <AdminUsersManager />
      </Suspense>
    </div>
  );
}
