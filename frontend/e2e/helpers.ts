import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:8000/api/v1";
export const PASSWORD = "E2e-Secret-123";

// The seeded title (scripts/e2e_seed.py).
export const MOVIE_SLUG = "e2e-movie-2001";
export const MOVIE_TITLE_FA = "فیلم آزمایشی";

// Where the app keeps the session (lib/api.ts).
const ACCESS_KEY = "rankverse_token";
const REFRESH_KEY = "rankverse_refresh_token";

export interface TestUser {
  email: string;
  username: string;
  password: string;
}

/** A user that no other test (or earlier run) has used. */
export function uniqueUser(label: string): TestUser {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return { email: `${label}-${id}@example.com`, username: `${label}${id}`, password: PASSWORD };
}

/** Creates the account through the API (fast) and returns the session tokens. */
export async function registerViaApi(request: APIRequestContext, user: TestUser) {
  const created = await request.post(`${API_URL}/auth/register`, { data: user });
  expect(created.ok(), `register failed: ${await created.text()}`).toBeTruthy();
  const login = await request.post(`${API_URL}/auth/login`, { data: { email: user.email, password: user.password } });
  expect(login.ok(), `login failed: ${await login.text()}`).toBeTruthy();
  const { data } = await login.json();
  return { access: data.access_token as string, refresh: data.refresh_token as string };
}

/**
 * Opens the site already signed in, by seeding the session before any page script runs.
 * Only seeds an empty browser: the init script runs again on every navigation, and must
 * not overwrite tokens the app has since replaced (e.g. after a password change).
 */
export async function signInWith(page: Page, tokens: { access: string; refresh: string }) {
  await page.addInitScript(
    ([a, r, ak, rk]) => {
      if (localStorage.getItem(ak)) return;
      localStorage.setItem(ak, a);
      localStorage.setItem(rk, r);
    },
    [tokens.access, tokens.refresh, ACCESS_KEY, REFRESH_KEY],
  );
}

export async function storedAccessToken(page: Page): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), ACCESS_KEY);
}
