import { Suspense } from "react";
import { AdminEntitiesManager } from "./AdminEntitiesManager";

export default function AdminEntitiesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">موجودیت‌ها</h1>
      <p className="mt-2 text-sm text-muted">
        خلاصهٔ داستان فارسی فیلم‌ها و سریال‌ها. برای عنوان‌هایی که TMDb ترجمهٔ فارسی ندارد می‌توانید متن دستی بنویسید؛ متن دستی
        نه با sync دوباره از TMDb و نه با اسکریپت ترجمهٔ ماشینی بازنویسی نمی‌شود. برای عنوان‌هایی که تریلرشان فقط در یوتیوب است (یا تریلر
        ندارند) می‌توانید لینک تریلر آپارات بگذارید؛ در صفحهٔ عنوان آپارات اول نمایش داده می‌شود. تغییر بلافاصله در صفحهٔ عنوان دیده می‌شود.
      </p>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <AdminEntitiesManager />
      </Suspense>
    </div>
  );
}
