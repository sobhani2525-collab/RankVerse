import { Suspense } from "react";
import { UserDetail } from "./UserDetail";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    // useSearchParams (tab / back) needs a Suspense boundary during prerender.
    <Suspense fallback={null}>
      <UserDetail id={id} />
    </Suspense>
  );
}
