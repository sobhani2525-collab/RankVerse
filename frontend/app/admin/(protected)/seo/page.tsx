import { SeoManager } from "./SeoManager";

export default function AdminSeoPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">SEO و کشف محتوا</h1>
      <p className="mt-2 text-sm text-muted">
        آنچه موتورهای جستجو از سایت می‌بینند: چه آدرس‌هایی در نقشهٔ سایت هستند، کدام صفحه‌ها چیزی کم دارند که نتیجهٔ جستجو را ضعیف می‌کند، و
        متادیتای هر صفحه همان‌طور که Googlebot آن را می‌خواند.
      </p>
      <SeoManager />
    </div>
  );
}
