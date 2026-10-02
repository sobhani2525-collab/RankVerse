import { toFaDigits } from "@/lib/format-number";

const STEPS = ["مشخصات لیست", "افزودن آیتم‌ها"];

/** Two-step indicator shared by the new-list form (step 1) and the draft page (step 2). */
export default function ListStepper({ current }: { current: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-3" aria-label="مراحل ساخت لیست">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            <span
              className={`num flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
                active
                  ? "border-gold bg-gold text-bg"
                  : done
                    ? "border-teal bg-teal/15 text-teal"
                    : "border-border text-dim"
              }`}
            >
              {done ? "✓" : toFaDigits(n)}
            </span>
            <span className={`text-sm ${active ? "font-extrabold text-ink" : "text-dim"}`}>{label}</span>
            {n < STEPS.length && <span className="h-px w-8 bg-border sm:w-14" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
