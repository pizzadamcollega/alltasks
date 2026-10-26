import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("manual entry (no timer, D-38)", () => {
  test("home has no Başla/Bitir, only the hand-entry form", async ({ page }) => {
    await login(page, "de-pijp", "can");
    await expect(page.getByRole("button", { name: "Başla" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Çalıştığım saatler" })).toBeVisible();
  });

  test("employee types in a past-midnight shift and it is approved straight away", async ({ page }) => {
    await login(page, "de-pijp", "can");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel("Tarih").fill(yesterday);
    await page.getByLabel("Başlangıç").fill("17:00");
    await page.getByLabel("Bitiş").fill("01:30");
    await expect(page.getByText("bitiş ertesi gün")).toBeVisible();
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kayıt eklendi")).toBeVisible();
    await expect(page.getByText("Elle girildi").first()).toBeVisible();
  });

  test("an overlapping entry is refused", async ({ page }) => {
    await login(page, "de-pijp", "can");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel("Tarih").fill(yesterday);
    await page.getByLabel("Başlangıç").fill("18:00");
    await page.getByLabel("Bitiş").fill("20:00");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByRole("alert")).toContainText("Bu saatlerde zaten bir kaydın var");
  });
});

test.describe("weekly program", () => {
  test("employee home shows the read-only week with today marked", async ({ page }) => {
    await login(page, "de-pijp", "can");
    const board = page.getByRole("region", { name: "Haftalık program" });
    await expect(board).toBeVisible();
    await expect(board.getByText("Bugün", { exact: true })).toBeVisible();
    await expect(board.getByRole("button", { name: /Kişi ekle/ })).toHaveCount(0);
  });

  test("patron adds someone to a day and the employee sees it", async ({ page }) => {
    await login(page, "de-pijp", "patron.pijp");
    await page.goto("/de-pijp/program");
    await page.getByRole("button", { name: "Kişi ekle" }).first().click();
    await page.getByLabel("Çalışan").selectOption({ label: "Can Öztürk" });
    await page.getByLabel("Başlangıç saati").fill("16:45");
    await page.getByRole("button", { name: "Ekle" }).click();
    await expect(page.getByLabel("Can Öztürk başlangıç saati").first()).toHaveValue("16:45");
  });
});
