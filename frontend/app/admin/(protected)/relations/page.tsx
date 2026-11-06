import { RelationsManager } from "./RelationsManager";

export default function AdminRelationsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">روابط</h1>
      <p className="mt-2 text-sm text-muted">
        یک فیلم، سریال، هنرمند یا ژانر را پیدا کنید؛ روابطش (کارگردان، بازیگر، سازنده، ژانر) نمایش داده می‌شود و می‌توانید رابطه
        اضافه یا حذف کنید. رابطه‌های حذف‌شده‌ای که از TMDb آمده‌اند ممکن است در sync بعدی برگردند؛ رابطه‌های دستی پایدارند.
      </p>
      <RelationsManager />
    </div>
  );
}
