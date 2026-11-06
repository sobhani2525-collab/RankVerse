import { redirect } from "next/navigation";

// Merged into /admin/entities (tab "all").
export default function AdminEntityManagerPage() {
  redirect("/admin/entities?tab=all");
}
