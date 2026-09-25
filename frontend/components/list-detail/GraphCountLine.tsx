"use client";
import { toFaDigits } from "@/lib/format-number";
import { connectionCount } from "@/lib/list-constellation";
import { useListViewer } from "./ListViewerContext";

/** The H1's second line, "{n} گره، {m} اتصال." -- live, so an added item counts at once. */
export default function GraphCountLine() {
  const { detail } = useListViewer();
  const nodes = detail.items.length;
  if (nodes === 0) return null;
  return (
    <>
      <br />
      <span className="text-dim">
        {toFaDigits(nodes)} گره، {toFaDigits(connectionCount(detail))} اتصال.
      </span>
    </>
  );
}
