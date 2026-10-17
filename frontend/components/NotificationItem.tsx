"use client";

import Link from "next/link";
import { relativeTimeFa } from "@/lib/relative-time";
import type { AppNotification } from "@/lib/notifications";

// One notification row, shared by the bell dropdown and the /notifications page.
export default function NotificationItem({
  n,
  onOpen,
  onDelete,
}: {
  n: AppNotification;
  onOpen: (n: AppNotification) => void;
  onDelete: (n: AppNotification) => void;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-gold"}`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-6 ${n.is_read ? "text-muted" : "text-ink"}`}>{n.message}</span>
        <span className="block text-xs text-muted">{relativeTimeFa(n.created_at)}</span>
      </span>
    </>
  );
  const cls = "flex flex-1 items-start gap-3 px-4 py-3 text-right";
  return (
    <li className="group flex items-start border-b border-border/60 transition hover:bg-surface2">
      {n.link ? (
        <Link href={n.link} onClick={() => onOpen(n)} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={() => onOpen(n)} className={cls}>
          {body}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(n)}
        aria-label="حذف اعلان"
        className="m-2 shrink-0 rounded-md px-2 py-1 text-xs text-muted opacity-60 transition hover:text-teal group-hover:opacity-100"
      >
        حذف
      </button>
    </li>
  );
}
