"use client";
import { toFaDigits } from "@/lib/format-number";
import { useListViewer } from "./ListViewerContext";

/** DNA follower count -- live, so it moves with the hero's follow button. */
export default function FollowerStat() {
  const { followerCount } = useListViewer();
  return (
    <div className="flex flex-col gap-0.5 lg:gap-1">
      <span className="num text-right text-2xl font-extrabold text-ink lg:text-[28px]">
        {toFaDigits(followerCount)}
      </span>
      <span className="text-xs text-muted">دنبال‌کننده</span>
    </div>
  );
}
