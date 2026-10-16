import { expect, test } from "@playwright/test";
import { API_URL, PASSWORD, registerViaApi, signInWith, storedAccessToken, uniqueUser } from "./helpers";

test.describe("accounts and sessions", () => {
  test("register, stay signed in after a reload, sign out, sign back in", async ({ page }) => {
    const user = uniqueUser("reg");

    await page.goto("/register");
    // Scoped to the form: the header's search box is also a text input.
    await page.locator('form input[type="text"]').fill(user.username);
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(user.password);
    await page.getByRole("button", { name: "ثبت‌نام", exact: true }).click();
    await page.waitForURL("/");

    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(user.username);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(user.username);

    // Signing out (dropping the stored session) sends the profile page to the login page.
    await page.evaluate(() => localStorage.clear());
    await page.goto("/profile");
    await page.waitForURL("**/login");

    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(user.password);
    await page.getByRole("button", { name: "ورود", exact: true }).click();
    await page.waitForURL("/");
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(user.username);
  });

  test("a wrong password keeps you on the login page with an error", async ({ page, request }) => {
    const user = uniqueUser("bad");
    await registerViaApi(request, user);

    await page.goto("/login");
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill("not-the-password-1");
    await page.getByRole("button", { name: "ورود", exact: true }).click();

    await expect(page.locator("form p")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("a guest opening the profile is sent to the login page", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL("**/login");
  });

  test("changing the password ends other devices' sessions and keeps this one signed in", async ({ page, request }) => {
    const user = uniqueUser("pw");
    const thisDevice = await registerViaApi(request, user);
    const login = await request.post(`${API_URL}/auth/login`, { data: { email: user.email, password: user.password } });
    const otherDevice = (await login.json()).data as { access_token: string; refresh_token: string };

    await signInWith(page, thisDevice);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(user.username);

    await page.getByRole("button", { name: "تنظیمات حساب" }).click();
    await page.getByLabel("رمز فعلی").fill(PASSWORD);
    await page.getByLabel("رمز جدید", { exact: true }).fill("E2e-New-Secret-456");
    await page.getByLabel("تکرار رمز جدید").fill("E2e-New-Secret-456");
    await page.getByRole("button", { name: "تغییر رمز", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "رمز عبور تغییر کرد" })).toBeVisible();

    // The other device's tokens no longer work...
    const stale = await request.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${otherDevice.access_token}` } });
    expect(stale.status()).toBe(401);
    const staleRefresh = await request.post(`${API_URL}/auth/refresh`, { params: { refresh_token: otherDevice.refresh_token } });
    expect(staleRefresh.status()).toBe(401);

    // ...while this browser switched to the fresh pair and is still signed in.
    const current = await storedAccessToken(page);
    expect(current).toBeTruthy();
    expect(current).not.toBe(thisDevice.access);
    const me = await request.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${current}` } });
    expect(me.status()).toBe(200);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(user.username);
  });
});
