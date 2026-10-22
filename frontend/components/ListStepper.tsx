import { toFaDigits } from "@/lib/format-number";

const STEPS = ["مشخصات فهرست", "افزودن آیتم‌ها"];

/**
 * Page header shared by the new-list form (step 1) and the draft page (step 2):
 * title, one-line lead and the step tabs, styled like the new-battle wizard's.
 */
export default function ListStepper({ current }: { current: 1 | 2 }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-3xl text-ink">ساخت فهرست جدید</h1>
      <p className="mt-2 text-sm text-muted">فیلم‌ها، سریال‌ها یا هنرمندان محبوبت را در یک فهرست جمع کن و منتشرش کن.</p>
      <ol className="mt-6 flex gap-2 text-sm" aria-label="مراحل ساخت فهرست">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <li
              key={label}
              aria-current={n === current ? "step" : undefined}
              className={`flex-1 rounded-lg border px-3 py-2 text-center ${
                n === current ? "border-gold text-gold" : n < current ? "border-teal/50 text-teal" : "border-border text-muted"
              }`}
            >
              {toFaDigits(n)}. {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
