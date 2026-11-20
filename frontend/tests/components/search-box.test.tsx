import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SearchBox from "@/components/SearchBox";
import type { SearchResult } from "@/lib/api";

const { search, push } = vi.hoisted(() => ({ search: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api", () => ({ searchEntities: search }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("ignores late responses and shows the type and year of the current result", async () => {
  vi.useFakeTimers();
  let finishOldSearch!: (items: SearchResult[]) => void;
  search.mockImplementationOnce(() => new Promise<SearchResult[]>((resolve) => { finishOldSearch = resolve; }));
  search.mockResolvedValueOnce([
    { id: "2", slug: "dune-2021", title: "Dune", title_fa: "تلماسه", type: "movie", image_url: null, year: 2021 },
  ]);

  render(<SearchBox scope="screen" />);
  const input = screen.getByRole("searchbox", { name: "جست‌وجوی فیلم و سریال" });
  fireEvent.change(input, { target: { value: "Arrival" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  fireEvent.change(input, { target: { value: "Dune" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  await act(async () => finishOldSearch([
    { id: "1", slug: "arrival", title: "Arrival", title_fa: null, type: "movie", image_url: null },
  ]));

  expect(search.mock.calls[0][2].signal.aborted).toBe(true);
  expect(search.mock.calls[1][2].scope).toBe("screen");
  expect(screen.queryByText("Arrival")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /تلماسه Dune فیلم · ۲۰۲۱/ })).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(push).toHaveBeenCalledWith("/movies/dune-2021");
});
