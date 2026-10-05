"use client";
import { usePathname } from "next/navigation";
import Footer from "./Footer";

/** The public footer everywhere except the admin panel (same rule as the header). */
export default function ConditionalFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <Footer />;
}
