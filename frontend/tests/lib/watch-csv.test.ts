import { describe, expect, it } from "vitest";
import { parseWatchCsv, splitCsvLine, watchLinkHref } from "@/lib/watch-links";

describe("splitCsvLine", () => {
  it("splits on commas and trims cells", () => {
    expect(splitCsvLine("a, b ,c")).toEqual(["a", "b", "c"]);
  });
  it("keeps commas and escaped quotes inside quoted cells", () => {
    expect(splitCsvLine('x,"https://a.ir/?q=1,2","say ""hi"""')).toEqual(["x", "https://a.ir/?q=1,2", 'say "hi"']);
  });
});

describe("parseWatchCsv", () => {
  it("parses rows, defaulting access to subscription and affiliate to false", () => {
    const { rows, errors } = parseWatchCsv("the-godfather-1972,Filimo,https://www.filimo.com/m/1\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { entity_slug: "the-godfather-1972", provider: "filimo", url: "https://www.filimo.com/m/1", access_type: "subscription", is_affiliate: false },
    ]);
  });

  it("reads access type and affiliate flag, and skips a header and blank lines", () => {
    const csv = ["slug,provider,url,access,affiliate", "", "heat-1995,namava,https://www.namava.ir/m/2,Rent,true", "lost-2004,filmnet,https://filmnet.ir/s/3,free,0"].join("\r\n");
    const { rows, errors } = parseWatchCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.entity_slug, r.access_type, r.is_affiliate])).toEqual([
      ["heat-1995", "rent", true],
      ["lost-2004", "free", false],
    ]);
  });

  it("reports short lines with their line number instead of failing the whole file", () => {
    const { rows, errors } = parseWatchCsv("ok-1,filimo,https://www.filimo.com/m/1\nonly-a-slug,filimo\nok-2,namava,https://www.namava.ir/m/2");
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("خط ۲");
  });
});

describe("watchLinkHref", () => {
  it("points at the API's counted redirect for that link", () => {
    expect(watchLinkHref({ id: "abc" })).toMatch(/\/watch-links\/abc\/go$/);
  });
});
