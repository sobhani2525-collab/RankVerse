import { AdminListsManager } from "./AdminListsManager";

export default function AdminListsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">فهرست‌ها و برگزیده‌ها</h1>
      <p className="mt-2 text-sm text-muted">
        تعیین فهرست‌های برگزیدهٔ صفحهٔ اصلی و پنهان‌کردن فهرست‌های بی‌کیفیت از کشف. فهرستی حذف نمی‌شود؛ فهرست پنهان با لینک مستقیم همچنان باز می‌شود.
      </p>
      <AdminListsManager />
    </div>
  );
}
