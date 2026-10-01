import type { Metadata } from "next";
import NewListForm from "@/components/NewListForm";

export const metadata: Metadata = {
  title: "ساخت لیست جدید",
  robots: { index: false, follow: false },
};

export default function NewListPage() {
  return <NewListForm />;
}
