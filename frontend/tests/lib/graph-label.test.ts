import { describe, expect, it } from "vitest";
import { labelLines } from "@/lib/graph-label";

describe("labelLines", () => {
  it("keeps a short name on one line", () => {
    expect(labelLines("کریستین بیل", { full: true, maxLine: 14 })).toEqual(["کریستین بیل"]);
  });
  it("writes a person's whole name, wrapped in two lines", () => {
    const lines = labelLines("فریده سپاه منصور جان", { full: true, maxLine: 10 });
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toBe("فریده سپاه منصور جان");
  });
  it("keeps at least two words of a title", () => {
    expect(labelLines("شوالیه تاریکی برمی‌خیزد", { full: false, maxLine: 5 })[0].startsWith("شوالیه تاریکی")).toBe(true);
  });
  it("adds an ellipsis when words are dropped", () => {
    const lines = labelLines("یک دو سه چهار پنج شش هفت هشت", { full: false, maxLine: 8 });
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines[lines.length - 1].endsWith("…")).toBe(true);
  });
});
