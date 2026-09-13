import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminMe } from "@/lib/admin-api";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";
import { AdminSidebar } from "./_components/AdminSidebar";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/admin/login");
  }

  // middleware.ts already verified the JWT signature/expiry at the edge;
  // this call re-checks against the DB (is_active, account still exists)
  // and gets us the admin's email/role to render in the sidebar.
  let adminEmail: string;
  try {
    const admin = await getAdminMe(token);
    adminEmail = admin.email;
  } catch {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen bg-bg" dir="rtl">
      <AdminSidebar adminEmail={adminEmail} />
      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}
