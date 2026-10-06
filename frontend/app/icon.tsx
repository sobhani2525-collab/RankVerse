import { brandIcon } from "@/lib/brand-icon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Browser tab / PWA icon (Next serves it as /icon and adds the <link>).
export default function Icon() {
  return brandIcon(512);
}
