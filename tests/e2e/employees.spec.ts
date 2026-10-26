import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("employees", () => {
  test("wage change is effective-dated, not retroactive", async ({ page }) => {
    await login(page, "de-pijp", "patron.pijp");
    await page.goto("/de-pijp/calisanlar");
    await page.getByText("Ahmet Yılmaz").click();

    await page.getByRole("button", { name: "Ücreti değiştir" }).click();
    await page.getByLabel("Yeni ücret (€)").fill("14.00");
    // Leave "Geçerlilik tarihi" at its default (1st of next month).
    await page.getByRole("button", { name: "Yeni ücreti kaydet" }).click();

    await expect(page.getByText("€14,00")).toBeVisible();
    // The wage history list should now show the previous rate with an end date.
    await expect(page.getByText("€13,00 / saat")).toBeVisible();
  });

  test("a manager can create a new employee account with a starting wage", async ({ page }) => {
    await login(page, "de-pijp", "patron.pijp");
    await page.goto("/de-pijp/calisanlar/yeni");

    await page.getByLabel("Ad soyad").fill("Test Çalışan");
    await expect(page.getByLabel("Kullanıcı adı")).toHaveValue("test.calisan");
    await page.getByLabel("Geçici şifre").fill("Gecici1234!");
    await page.getByLabel("Saatlik ücret (€)").fill("13.50");
    await page.getByRole("button", { name: "Hesabı oluştur" }).click();

    await expect(page.getByText("Test Çalışan")).toBeVisible();
  });

  test("a manager cannot change their own wage", async ({ page }) => {
    // wage_rates_write RLS forbids user_id = auth.uid() for a manager; there
    // is no UI entry point for a manager to edit their own wage at all.
    await login(page, "de-pijp", "patron.pijp");
    await page.goto("/de-pijp/profil");
    await expect(page.getByText("Saatlik ücret")).toHaveCount(0);
  });
});
