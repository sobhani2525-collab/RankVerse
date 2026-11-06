import { Suspense } from "react";
import { EntitiesTabs } from "./EntitiesTabs";

export default function AdminEntitiesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">موجودیت‌ها و روابط</h1>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <EntitiesTabs />
      </Suspense>
    </div>
  );
}
