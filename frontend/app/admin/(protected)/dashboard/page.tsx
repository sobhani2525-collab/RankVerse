import { DashboardOverview } from "./DashboardOverview";

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">داشبورد</h1>
      <p className="mt-2 text-sm text-muted">
        آمار کلی پلتفرم: کاربران، تعامل، محتوا و روند ۳۰ روز اخیر. روزها بر اساس تقویم تهران شمرده می‌شوند.
      </p>
      <DashboardOverview />
    </div>
  );
}
