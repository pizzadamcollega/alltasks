import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("clock", () => {
  test("employee can clock in and back out", async ({ page }) => {
    await login(page, "de-pijp", "can");
    await expect(page.getByText("Mesaide değilsin")).toBeVisible();

    await page.getByRole("button", { name: "Başla" }).click();
    await expect(page.getByText("Mesaide")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bitir" })).toBeVisible();

    await page.getByRole("button", { name: "Bitir" }).click();
    await expect(page.getByText("Mesai bitti · onay bekliyor")).toBeVisible();
    await expect(page.getByText("Mesaide değilsin")).toBeVisible();
  });

  test("the clock card never offers Başla while a shift is already running", async ({ page }) => {
    await login(page, "de-pijp", "deniz");
    await page.getByRole("button", { name: "Başla" }).click();
    await expect(page.getByRole("button", { name: "Başla" })).toHaveCount(0);
    // Clean up so the seed stays reusable for the next test run.
    await page.getByRole("button", { name: "Bitir" }).click();
  });
});
