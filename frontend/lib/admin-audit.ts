export interface AdminAuditLogRow {
  id: string;
  admin_id: string | null;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

/** The one place audit actions get their Persian label (every audit view uses it). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.update": "ویرایش کاربر",
  "user.block": "مسدودسازی کاربر",
  "user.unblock": "رفع مسدودیت کاربر",
  "user.delete": "حذف کاربر",
  "user.restore": "بازیابی کاربر",
  "user.verify_email": "تأیید دستی ایمیل",
  "user.send_password_reset": "ارسال بازیابی رمز",
  "user.export": "خروجی کاربران",
  "list.update": "ویرایش کوراسیون فهرست",
  "list.delete": "حذف فهرست",
  "list.item_remove": "حذف آیتم از فهرست",
  "list.items_reorder": "مرتب‌سازی آیتم‌های فهرست",
  "list.featured_reorder": "مرتب‌سازی برگزیده‌ها",
  "daily_battle.create": "ثبت نبرد روز",
  "daily_battle.update": "ویرایش نبرد روز",
  "daily_battle.delete": "حذف نبرد روز",
  "admin.login": "ورود ادمین",
  "admin.password_change": "تغییر رمز ادمین",
  "audit_log.export": "خروجی تاریخچهٔ مدیریتی",
  "entity.overview.set": "نوشتن خلاصهٔ دستی",
  "entity.overview.reset": "حذف خلاصهٔ دستی",
  "ingestion.sync": "همگام‌سازی از TMDb",
  "ranking.recompute": "بازمحاسبهٔ امتیاز",
};

export const AUDIT_TARGET_LABELS: Record<string, string> = {
  user: "کاربر",
  list: "فهرست",
  daily_battle: "نبرد روز",
  admin: "ادمین",
  audit_log: "تاریخچه",
  entity: "عنوان",
};

export const auditActionLabel = (action: string) => AUDIT_ACTION_LABELS[action] ?? action;

/** Badge colour by the kind of change: destructive, access-related, or ordinary. */
export function auditActionTone(action: string): string {
  if (/\.(delete|block|item_remove)$/.test(action)) return "border-red-500/40 bg-red-500/10 text-red-300";
  if (action.startsWith("admin.") || /\.(unblock|restore|verify_email)$/.test(action)) return "border-teal/40 bg-teal/10 text-teal";
  if (action.endsWith(".export")) return "border-violet/40 bg-violet/10 text-violet-soft";
  return "border-gold/40 bg-gold/10 text-gold";
}

/** Admin-panel page for an audit target, when one exists. */
export function auditTargetHref(targetType: string, targetId: string): string | null {
  if (targetType === "user" && /^[0-9a-f-]{36}$/i.test(targetId)) return `/admin/users/${targetId}`;
  if (targetType === "list") return "/admin/lists";
  if (targetType === "daily_battle") return "/admin/daily-battles";
  return null;
}
