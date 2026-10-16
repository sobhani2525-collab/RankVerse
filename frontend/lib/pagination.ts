/**
 * Page numbers to show in a pager: first and last page, the current page
 * with `around` neighbours on each side, and null where a gap is collapsed
 * (rendered as "…").
 */
export function pageWindow(page: number, totalPages: number, around = 2): (number | null)[] {
  if (totalPages <= 1) return [1];
  const current = Math.min(Math.max(page, 1), totalPages);
  const wanted = new Set<number>([1, totalPages]);
  for (let p = current - around; p <= current + around; p++) {
    if (p >= 1 && p <= totalPages) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (i > 0) {
      if (p - prev === 2) out.push(prev + 1);
      else if (p - prev > 2) out.push(null);
    }
    out.push(p);
  });
  return out;
}
