import { ReactNode } from "react";

/**
 * The home page's section header: a small English kicker (JetBrains Mono,
 * the "instrument label" voice) over a Persian display headline.
 */
export default function SectionHeading({
  kicker,
  title,
  lead,
  action,
  center = false,
}: {
  kicker: string;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={`mb-10 flex flex-col gap-4 ${center ? "items-center text-center" : "md:flex-row md:items-end md:justify-between"}`}>
      <div className={center ? "max-w-2xl" : "max-w-2xl"}>
        <p className="kicker text-teal/80">{kicker}</p>
        <h2 className="font-display mt-3 text-3xl leading-tight text-ink sm:text-4xl">{title}</h2>
        {lead && <p className="mt-3 text-sm leading-7 text-muted sm:text-base">{lead}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
