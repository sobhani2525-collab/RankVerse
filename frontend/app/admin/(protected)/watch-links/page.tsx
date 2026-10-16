import { AdminWatchLinksManager } from "./AdminWatchLinksManager";

export default function AdminWatchLinksPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">کجا ببینم</h1>
      <p className="mt-2 text-sm text-muted">
        لینک تماشای فیلم‌ها و سریال‌ها در فیلیمو، نماوا، تلوبیون و فیلم‌نت. لینک باید روی دامنهٔ همان سرویس باشد؛ بازدیدکننده‌ها
        از مسیر شمارنده می‌گذرند و شمارش کلیک‌ها همین‌جا دیده می‌شود. لینک‌های همکاری (affiliate) در صفحهٔ عنوان با توضیح نمایش داده
        می‌شوند. تغییرها پس از بازتولید صفحهٔ عنوان (حداکثر یک ساعت) دیده می‌شوند.
      </p>
      <AdminWatchLinksManager />
    </div>
  );
}
