import { AlertsManager } from "./AlertsManager";

export default function AdminAlertsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">هشدارهای عملیاتی</h1>
      <p className="mt-2 text-sm text-muted">
        خطاهای تکراری سرور، شکست همگام‌سازی، کندی صفحه‌ها، مشکل اتصال به دیتابیس و تلاش‌های مشکوک ورود. هشدارهای مشابه در یک ردیف جمع می‌شوند.
      </p>
      <AlertsManager />
    </div>
  );
}
