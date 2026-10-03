import { AdminDailyBattlesManager } from "./AdminDailyBattlesManager";

export default function AdminDailyBattlesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">نبرد روز</h1>
      <p className="mt-2 text-sm text-muted">
        هر روز (به وقت تهران) یک جفت فیلم ثابت برای همه نشان داده می‌شود. اگر برای روزی جفتی نگذاری، با اولین بازدید آن روز خودکار انتخاب می‌شود.
        جفت‌هایی که رأی دارند دیگر قابل ویرایش یا حذف نیستند.
      </p>
      <AdminDailyBattlesManager />
    </div>
  );
}
