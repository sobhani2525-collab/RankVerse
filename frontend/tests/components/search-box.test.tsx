import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SearchBox from "@/components/SearchBox";
import HeroConstellation from "@/components/home/HeroConstellation";
import EgoSky from "@/components/graph/EgoSky";
import type { EgoGraph, EgoNode, SearchResult } from "@/lib/api";

const { search, push, getGraph, getPool } = vi.hoisted(() => ({
  search: vi.fn(), push: vi.fn(), getGraph: vi.fn(), getPool: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ searchEntities: search, getEgoGraph: getGraph, getHeroGraphs: getPool }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("shows loading, centers the galaxy on a search result, and returns along the path", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  const artist = { id: "1", slug: "artist", title: "Test Artist", title_fa: null, image_url: null };
  const movie: EgoNode = { ...artist, id: "2", slug: "movie", title: "Test Movie", entity_type: "movie", role: "center", year: null, score: null };
  search.mockResolvedValue([{ ...artist, type: "person" }]);
  let finishGraph!: (graph: EgoGraph) => void;
  getGraph.mockImplementation(() => new Promise<EgoGraph>((resolve) => { finishGraph = resolve; }));

  render(<HeroConstellation graphs={[{ center_id: movie.id, nodes: [movie], edges: [] }]} text={null} />);
  const input = screen.getByRole("searchbox", { name: "جست‌وجو در کهکشان سینماگزین" });
  fireEvent.change(input, { target: { value: "Artist" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Test Artist هنرمند/ })); });

  expect(search.mock.calls[0][2].scope).toBe("galaxy");
  expect(getGraph).toHaveBeenCalledWith(artist.slug);
  expect(screen.getByRole("status")).toHaveTextContent("در حال بارگذاری گراف");
  await act(async () => finishGraph({
    center_id: artist.id,
    nodes: [{ ...artist, entity_type: "person", role: "center", year: null, score: null }],
    edges: [],
  }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: artist.title }).length).toBeGreaterThan(0);
  const path = within(screen.getByRole("navigation", { name: "مسیر کاوش کهکشان" }));
  expect(path.getByRole("button", { name: artist.title })).toHaveAttribute("aria-current", "step");
  fireEvent.click(path.getByRole("button", { name: movie.title }));
  expect(path.getByRole("button", { name: movie.title })).toHaveAttribute("aria-current", "step");
  expect(path.queryByRole("button", { name: artist.title })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: movie.title }).length).toBeGreaterThan(0);
  expect(getGraph).toHaveBeenCalledTimes(1);
  expect(push).not.toHaveBeenCalled();
});

it("keeps the clicked star and its hit target mounted while they move to the center", () => {
  const movie: EgoNode = {
    id: "movie", slug: "movie", title: "Test Movie", title_fa: null,
    image_url: null, entity_type: "movie", role: "center", year: null, score: null,
  };
  const artist: EgoNode = { ...movie, id: "artist", slug: "artist", title: "Test Artist", entity_type: "person", role: "person" };
  const nextGraph = { center_id: artist.id, nodes: [{ ...artist, role: "center" as const }], edges: [] };
  const { container, rerender } = render(
    <EgoSky animateRecenter graph={{ center_id: movie.id, nodes: [movie, artist], edges: [] }} onSelect={vi.fn()} />,
  );
  const hit = screen.getByRole("button", { name: /Test Artist/ });
  const star = Array.from(container.querySelectorAll<SVGGElement>(".rv-recenter-star"))
    .find((node) => node.textContent?.includes(artist.title))!;
  const start = star.style.transform;

  rerender(<EgoSky animateRecenter graph={nextGraph} onSelect={vi.fn()} />);

  expect(start).not.toBe("translate(50px, 50px)");
  expect(star).toBeInTheDocument();
  expect(star.style.transform).toBe("translate(50px, 50px)");
  expect(screen.getByRole("button", { name: /Test Artist/ })).toBe(hit);
});

it("reuses the graph request started before a node click", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  const movie: EgoNode = {
    id: "movie", slug: "movie", title: "Test Movie", title_fa: null,
    image_url: null, entity_type: "movie", role: "center", year: null, score: null,
  };
  const genre: EgoNode = { ...movie, id: "drama", slug: "drama", title: "Drama", entity_type: "genre", role: "genre" };
  let finishGraph!: (graph: EgoGraph) => void;
  getGraph.mockImplementation(() => new Promise<EgoGraph>((resolve) => { finishGraph = resolve; }));
  render(<HeroConstellation graphs={[{ center_id: movie.id, nodes: [movie, genre], edges: [] }]} text={null} />);
  const node = screen.getByRole("button", { name: /درام.*مرکز کن/ });
  fireEvent.mouseEnter(node);
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  expect(getGraph).toHaveBeenCalledWith("drama");
  fireEvent.click(node);
  expect(getGraph).toHaveBeenCalledTimes(1);
  await act(async () => finishGraph({ center_id: genre.id, nodes: [{ ...genre, role: "center" }], edges: [] }));
  expect(screen.getByRole("button", { name: "درام" })).toHaveAttribute("aria-current", "step");
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
