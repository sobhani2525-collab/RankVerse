import { act, render, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { HomePicksProvider } from "@/components/home/HomePicks";
import TonightChoices from "@/components/home/TonightChoices";
import TasteBand from "@/components/home/TasteBand";

const { auth, getPicks, favorites } = vi.hoisted(() => ({
  auth: vi.fn(),
  getPicks: vi.fn(),
  favorites: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: auth }));
vi.mock("@/lib/api", () => ({ getMyPredictedPicks: getPicks }));
vi.mock("@/contexts/FavoritesContext", () => ({ useFavorites: favorites }));

const getToken = () => "viewer-token";
const visitor = { user: null, loading: false, isAuthenticated: false, getToken };
const viewer = { ...visitor, user: { id: "viewer" }, isAuthenticated: true };
const fallback = [{ id: "popular", title: "Popular Film", href: "/movies/popular" }];
const tree = () => (
  <HomePicksProvider><TonightChoices fallback={fallback} /></HomePicksProvider>
);

beforeEach(() => {
  auth.mockReset();
  getPicks.mockReset();
  favorites.mockReturnValue({ screenFavoritesRevision: 0 });
});

it("replaces the popular picks with the signed-in viewer's film and TV recommendations", async () => {
  auth.mockReturnValue(viewer);
  getPicks.mockResolvedValue([
    { entity: { id: "film", entity_type: "movie", slug: "personal-film", title: "Personal Film", title_fa: "فیلم شخصی" } },
    { entity: { id: "series", entity_type: "tv_series", slug: "personal-series", title: "Personal Series" } },
  ]);
  const { rerender } = render(tree());

  const film = await screen.findByRole("link", { name: "فیلم شخصی (Personal Film)" });
  expect(film).toHaveAttribute("href", "/movies/personal-film");
  expect(within(film).getByText("فیلم شخصی")).toBeInTheDocument();
  expect(within(film).getByText("Personal Film")).toHaveAttribute("dir", "ltr");
  expect(screen.getByRole("link", { name: "Personal Series" })).toHaveAttribute("href", "/tv-series/personal-series");
  expect(screen.queryByRole("link", { name: "Popular Film" })).not.toBeInTheDocument();
  expect(getPicks).toHaveBeenCalledWith("viewer-token", 5);

  auth.mockReturnValue(visitor);
  rerender(tree());
  expect(screen.queryByRole("link", { name: "فیلم شخصی (Personal Film)" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Popular Film" })).toBeInTheDocument();
});

it("keeps popular picks when the viewer has no taste recommendations", async () => {
  auth.mockReturnValue(viewer);
  getPicks.mockResolvedValue([]);
  render(tree());

  expect(await screen.findByRole("link", { name: "Popular Film" })).toBeInTheDocument();
  expect(screen.queryByText("بر اساس سلیقهٔ سینمایی تو")).not.toBeInTheDocument();
});

it("refreshes tonight's picks after a confirmed favorite change", async () => {
  auth.mockReturnValue(viewer);
  getPicks.mockResolvedValueOnce([]).mockResolvedValueOnce([
    { entity: { id: "film", entity_type: "movie", slug: "new-pick", title: "New Pick" } },
  ]);
  const { rerender } = render(tree());
  favorites.mockReturnValue({ screenFavoritesRevision: 1 });
  rerender(tree());

  expect(await screen.findByRole("link", { name: "New Pick" })).toBeInTheDocument();
  expect(getPicks).toHaveBeenCalledTimes(2);
});

it("hydrates anonymous server markup before showing signed-in recommendations", async () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  auth.mockReturnValue(visitor);
  const page = (
    <HomePicksProvider>
      <TonightChoices fallback={fallback} />
      <TasteBand />
    </HomePicksProvider>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(page);
  expect(container.querySelector("#taste-picks")).toBeNull();

  auth.mockReturnValue(viewer);
  getPicks.mockResolvedValue([
    { entity: { id: "film", entity_type: "movie", slug: "personal-film", title: "Personal Film" } },
  ]);
  const onRecoverableError = vi.fn();
  const root = hydrateRoot(container, page, { onRecoverableError });
  try {
    await act(async () => {});
    expect(container.querySelector("#taste-picks")).toHaveTextContent("Personal Film");
    expect(onRecoverableError).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
