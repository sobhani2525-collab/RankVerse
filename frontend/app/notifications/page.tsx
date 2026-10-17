import type { Metadata } from "next";
import NotificationsView from "./NotificationsView";

export const metadata: Metadata = {
  title: "اعلان‌ها",
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationsView />;
}
