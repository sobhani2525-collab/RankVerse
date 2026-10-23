import { IngestionManager } from "./IngestionManager";

export default function AdminIngestionPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Ingestion و منابع داده</h1>
      <p className="mt-2 text-sm text-muted">
        داده‌ها از کجا می‌آیند و چقدر تازه‌اند: وضعیت TMDb، IMDb و ترجمهٔ ماشینی، پوشش خلاصه‌ها و زندگی‌نامه‌ها، و همگام‌سازی دستی یک
        عنوان از TMDb. هر همگام‌سازی در تاریخچهٔ مدیریتی ثبت می‌شود.
      </p>
      <IngestionManager />
    </div>
  );
}
