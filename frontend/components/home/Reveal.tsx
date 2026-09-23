"use client";

import { ReactNode } from "react";
import { useInView } from "@/lib/use-in-view";

/** Fades/slides its children in the first time they scroll into view (see .rv-reveal in globals.css). */
export default function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-inview={inView}
      className={`rv-reveal ${className}`}
      style={{ ["--rv-delay" as string]: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
