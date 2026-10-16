import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RankingsPager from "@/components/RankingsPager";
import { parseDecade, parseOrigin, parsePage, parseRankingType, parseSort } from "@/lib/ranking-options";

const hrefFor = (p: number) => `/genre/drama?page=${p}`;

describe("RankingsPager", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<RankingsPager page={1} totalPages={1} hasNext={false} hrefFor={hrefFor} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links numbered pages with the active filters and marks the current one", () => {
    render(<RankingsPager page={5} totalPages={464} hasNext hrefFor={hrefFor} />);
    expect(screen.getByRole("link", { name: "صفحهٔ ۵" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "صفحهٔ ۶" })).toHaveAttribute("href", "/genre/drama?page=6");
    expect(screen.getByRole("link", { name: "صفحهٔ ۴۶۴" })).toHaveAttribute("href", "/genre/drama?page=464");
    expect(screen.getByRole("link", { name: /قبلی/ })).toHaveAttribute("href", "/genre/drama?page=4");
    expect(screen.getByRole("link", { name: /بعدی/ })).toHaveAttribute("href", "/genre/drama?page=6");
  });

  it("has no previous link on page one and no next link on the last page", () => {
    const { rerender } = render(<RankingsPager page={1} totalPages={3} hasNext hrefFor={hrefFor} />);
    expect(screen.queryByRole("link", { name: /قبلی/ })).not.toBeInTheDocument();
    rerender(<RankingsPager page={3} totalPages={3} hasNext={false} hrefFor={hrefFor} />);
    expect(screen.queryByRole("link", { name: /بعدی/ })).not.toBeInTheDocument();
  });

  it("falls back to a plain page label when the total is unknown", () => {
    render(<RankingsPager page={2} totalPages={null} hasNext hrefFor={hrefFor} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText(/صفحهٔ/)).toHaveTextContent("۲");
  });
});

describe("ranking query parsing", () => {
  it("falls back to safe defaults for junk values", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("7")).toBe(7);
    expect(parseRankingType("nonsense")).toBe("movie");
    expect(parseRankingType("tv_series")).toBe("tv_series");
    expect(parseSort("hax")).toBe("score");
    expect(parseSort("votes")).toBe("votes");
    expect(parseOrigin("mars")).toBe("all");
    expect(parseDecade("1985")).toBeUndefined();
    expect(parseDecade("1990")).toBe(1990);
  });
});
