import { Suspense } from "react";
import { EntityManager } from "./EntityManager";

export default function AdminEntityManagerPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">مدیریت همهٔ موجودیت‌ها</h1>
      <p className="mt-2 text-sm text-muted">
        همهٔ موجودیت‌ها (فیلم، سریال، هنرمند، ژانر و …): جستجو، ساخت، ویرایش نام/سال/تصویر/متن فارسی و حذف. حذف قطعی است و
        روابط، رأی‌ها و آیتم‌های فهرست مربوط به آن موجودیت هم پاک می‌شود. متن فارسی ذخیره‌شده «دستی» می‌شود و sync آن را بازنویسی نمی‌کند.
      </p>
      <Suspense fallback={null}>
        <EntityManager />
      </Suspense>
    </div>
  );
}
