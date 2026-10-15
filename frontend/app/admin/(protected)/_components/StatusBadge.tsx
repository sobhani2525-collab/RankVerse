import type { UserStatus } from "@/lib/admin-users";

const STATUS: Record<UserStatus, { label: string; cls: string }> = {
  active: { label: "فعال", cls: "border-teal/40 bg-teal/10 text-teal" },
  blocked: { label: "مسدود", cls: "border-gold/40 bg-gold/10 text-gold" },
  deleted: { label: "حذف‌شده", cls: "border-red-500/40 bg-red-500/10 text-red-400" },
};

export function StatusBadge({ status }: { status: UserStatus }) {
  const s = STATUS[status];
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}
