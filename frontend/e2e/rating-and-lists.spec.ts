import { expect, test } from "@playwright/test";
import { API_URL, MOVIE_SLUG, registerViaApi, signInWith, uniqueUser } from "./helpers";

test.describe("signed-in actions", () => {
  test("rating a movie is saved and is still there after a reload", async ({ page, request }) => {
    const tokens = await registerViaApi(request, uniqueUser("rate"));
    await signInWith(page, tokens);
    await page.goto(`/movies/${MOVIE_SLUG}`);

    const star = page.getByRole("button", { name: "امتیاز 4 از 5" }).first();
    // The session is read on the client; retry the click until it has loaded.
    await expect(async () => {
      await star.click();
      await expect(page.getByText(/امتیاز شما ثبت شد/)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByRole("button", { name: "امتیاز 4 از 5" }).first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/امتیاز شما ثبت شد/)).toBeVisible();

    // And the API agrees.
    const mine = await request.get(`${API_URL}/users/me/ratings`, { headers: { Authorization: `Bearer ${tokens.access}` } });
    const ratings = (await mine.json()).data as { movie_slug?: string }[];
    expect(ratings.map((r) => r.movie_slug)).toContain(MOVIE_SLUG);
  });

  test("creating a list lands on the add-items step and the list exists", async ({ page, request }) => {
    const tokens = await registerViaApi(request, uniqueUser("list"));
    await signInWith(page, tokens);
    await page.goto("/lists/new");

    const title = `فهرست آزمایشی ${Date.now()}`;
    await page.getByPlaceholder(/مثلاً/).fill(title);
    // requireAuth needs the client-side session; retry the submit until it is ready.
    await expect(async () => {
      await page.getByRole("button", { name: "ادامه و افزودن آیتم‌ها" }).click();
      await page.waitForURL(/\/lists\/new\/.+/, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });

    const mine = await request.get(`${API_URL}/users/me/lists`, { headers: { Authorization: `Bearer ${tokens.access}` } });
    const lists = (await mine.json()).data as { title: string; visibility: string }[];
    const created = lists.find((l) => l.title === title);
    expect(created).toBeTruthy();
    // New lists start as private drafts until they are published.
    expect(created?.visibility).toBe("private");
  });
});
