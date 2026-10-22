import { AdminBattlesManager } from "./AdminBattlesManager";

export default function AdminBattlesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">نبردها و برگزیده‌ها</h1>
      <p className="mt-2 text-sm text-muted">
        نبردهای «برنده می‌ماند» که کاربران ساخته‌اند. نبردهای برگزیده در بالای /battles می‌آیند و یکی از آن‌ها به‌صورت تصادفی در بخش
        «بگذار فیلم‌ها بجنگند» صفحهٔ اصلی بازی می‌شود. نبردی حذف نمی‌شود؛ نبرد پنهان یا بایگانی‌شده با لینک مستقیم همچنان باز می‌شود. نبرد روز از صفحهٔ «نبرد روز» مدیریت می‌شود.
      </p>
      <AdminBattlesManager />
    </div>
  );
}
