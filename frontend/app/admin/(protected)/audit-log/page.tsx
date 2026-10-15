import { Suspense } from "react";
import { AuditLogManager } from "./AuditLogManager";

export default function AdminAuditLogPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">تاریخچهٔ مدیریتی (Audit Log)</h1>
      <p className="mt-2 text-sm text-muted">
        فهرست اقدامات انجام‌شده توسط مدیران: چه کسی، چه کاری، روی چه چیزی و با چه تغییری. این گزارش فقط‌خواندنی است و هیچ ردیفی ویرایش یا حذف نمی‌شود.
      </p>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <AuditLogManager />
      </Suspense>
    </div>
  );
}
