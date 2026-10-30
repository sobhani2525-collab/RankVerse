/**
 * Lines for a graph node's name. A person's name is always written in full (wrapped onto a
 * second line when long); a title or genre gets as many words as fit in two lines, never fewer
 * than its first two words, and an ellipsis when words were left out.
 */
export function labelLines(name: string, opts: { full: boolean; maxLine: number }): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.join(" ").length <= opts.maxLine) return [words.join(" ")];

  // Two lines, split where the lengths balance best.
  let best = 1;
  let bestGap = Infinity;
  for (let k = 1; k < words.length; k++) {
    const gap = Math.abs(words.slice(0, k).join(" ").length - words.slice(k).join(" ").length);
    if (gap < bestGap) {
      bestGap = gap;
      best = k;
    }
  }
  if (opts.full) return words.length === 1 ? [words[0]] : [words.slice(0, best).join(" "), words.slice(best).join(" ")];

  // Greedy fill of up to two lines, keeping at least the first two words.
  const lines: string[] = [""];
  let used = 0;
  for (const w of words) {
    const cur = lines[lines.length - 1];
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= opts.maxLine || used < 2) {
      lines[lines.length - 1] = next;
    } else if (lines.length < 2) {
      lines.push(w);
    } else {
      break;
    }
    used++;
  }
  if (used < words.length) lines[lines.length - 1] += "…";
  return lines;
}
