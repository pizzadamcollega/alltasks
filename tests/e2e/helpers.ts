import type { Page } from "@playwright/test";

/** Seeded by `scripts/seed-test-users.ts` (local only); password is fixed for all of them. */
export const SEED_PASSWORD = "Test1234!";

export async function login(page: Page, branch: string, username: string, password = SEED_PASSWORD) {
  await page.goto(`/${branch}/giris`);
  await page.getByLabel("Kullanıcı adı").fill(username);
  await page.getByLabel("Şifre").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}
