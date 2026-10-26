import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Needs `supabase start` + `npm run db:seed-users` first (docs/TEST-PLAN.md §3).
 * Seed users: ahmet/elif/murat/can/sena/deniz (de-pijp), zeynep (zuid),
 * elif (both branches), patron.pijp, patron.zuid, admin.
 */
test.describe("auth", () => {
  test("employee can log in and reach their home page", async ({ page }) => {
    await login(page, "de-pijp", "ahmet");
    await expect(page).toHaveURL("/de-pijp");
    await expect(page.getByText(/Merhaba, Ahmet/)).toBeVisible();
  });

  test("manager can log in and reach the branch dashboard", async ({ page }) => {
    await login(page, "de-pijp", "patron.pijp");
    await expect(page).toHaveURL("/de-pijp");
    await expect(page.getByText("Bugün çalışanlar")).toBeVisible();
  });

  test("wrong password shows one generic Turkish error", async ({ page }) => {
    await page.goto("/de-pijp/giris");
    await page.getByLabel("Kullanıcı adı").fill("ahmet");
    await page.getByLabel("Şifre").fill("wrong-password");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByRole("alert")).toHaveText("Kullanıcı adı veya şifre hatalı.");
  });

  test("an employee cannot reach a manager-only route", async ({ page }) => {
    await login(page, "de-pijp", "ahmet");
    await page.goto("/de-pijp/onay");
    await expect(page).toHaveURL("/de-pijp");
  });

  test("visiting a branch you don't belong to signs you out with a message", async ({ page }) => {
    await login(page, "zuid", "zeynep"); // zeynep is zuid-only per seed data
    await page.goto("/de-pijp");
    await expect(page).toHaveURL(/\/de-pijp\/giris\?hata=yetkisiz/);
    await expect(page.getByRole("alert")).toHaveText("Bu şubeye kayıtlı değilsin.");
  });

  test("an unknown branch slug 404s", async ({ page }) => {
    const response = await page.goto("/nonexistent-branch/giris");
    expect(response?.status()).toBe(404);
  });
});
