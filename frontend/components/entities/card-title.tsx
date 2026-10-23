import { splitTitle } from "@/lib/title";

/**
 * Card title on two lines: the Persian title first, the original (English)
 * title under it, smaller and dimmer. Renders two block spans, so the
 * caller's wrapper (a Link, a <p>, a button…) keeps the layout and the hover
 * colour -- which reaches the first line only, since the second sets its own.
 *
 * `className` styles the first line (pass truncate / line-clamp-* there);
 * the second line is always one truncated LTR line, aligned right like the
 * rest of the card or centred with `center`.
 */
export default function CardTitle({
  entity,
  className = "",
  subClassName = "text-[11px] text-muted",
  center = false,
}: {
  entity: { title: string; title_fa?: string | null };
  className?: string;
  subClassName?: string;
  center?: boolean;
}) {
  const { primary, secondary } = splitTitle(entity);
  return (
    <>
      <span className={`block ${className}`}>{primary}</span>
      {secondary && (
        <span
          dir="ltr"
          className={`mt-0.5 block truncate font-normal ${center ? "text-center" : "text-right"} ${subClassName}`}
        >
          {secondary}
        </span>
      )}
    </>
  );
}
