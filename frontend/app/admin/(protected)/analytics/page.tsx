import { Suspense } from "react";
import { AnalyticsManager } from "./AnalyticsManager";

export default function AdminAnalyticsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">آنالیتیکس</h1>
      <p className="mt-2 text-sm text-muted">
        روند استفاده از پلتفرم در بازهٔ انتخابی، در مقایسه با بازهٔ هم‌اندازهٔ قبل: کاربران فعال، فعال‌سازی کاربران جدید، سهم هر بخش از رأی‌ها و محبوب‌ترین محتوا. روزها بر اساس تقویم تهران‌اند.
      </p>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <AnalyticsManager />
      </Suspense>
    </div>
  );
}
