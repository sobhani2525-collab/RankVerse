import { redirect } from "next/navigation";

// Merged into /admin/entities (tab "relations").
export default function AdminRelationsPage() {
  redirect("/admin/entities?tab=relations");
}
