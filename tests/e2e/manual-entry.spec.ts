import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import type { Page } from "@playwright/test";

/** TimePicker: open the sheet, tap the hour, tap the minute (which closes it). */
async function pickTime(page: Page, label: "Başlangıç" | "Bitiş", time: string) {
  const [h, m] = time.split(":");
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: h, exact: true }).click();
  await sheet.getByRole("button", { name: `:${m}`, exact: true }).click();
  await expect(sheet).toHaveCount(0);
}

test.describe("hours: start now, finish later (D-46)", () => {
  test("start, then finish: the entry waits for the kasacı", async ({ page }) => {
    await login(page, "de-pijp", "can");
    await page.getByRole("button", { name: "Mesaiye başla" }).click();
    await expect(page.getByRole("heading", { name: "Mesai devam ediyor" })).toBeVisible();
    await page.getByRole("button", { name: "Mesaiyi bitir ve onaya gönder" }).click();
    await expect(page.getByText("kasacı onayına gönderildi")).toBeVisible();
  });

  test("a forgotten past-midnight shift goes to approval, not straight to approved", async ({ page }) => {
    await login(page, "de-pijp", "can");
    await page.getByText("Unuttuğun bir günü ekle").click();
    await page.getByRole("radio", { name: /Dün/ }).click();
    await pickTime(page, "Başlangıç", "17:00");
    await pickTime(page, "Bitiş", "01:30");
    await expect(page.getByText("bitiş ertesi gün")).toBeVisible();
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kayıt eklendi")).toBeVisible();
    await expect(page.getByText("Elle girildi").first()).toBeVisible();
    await expect(page.getByText("Bekliyor").first()).toBeVisible();
  });

  test("an overlapping entry is refused", async ({ page }) => {
    await login(page, "de-pijp", "can");
    await page.getByText("Unuttuğun bir günü ekle").click();
    await page.getByRole("radio", { name: /Dün/ }).click();
    await pickTime(page, "Başlangıç", "18:00");
    await pickTime(page, "Bitiş", "20:00");
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
    await page.getByRole("button", { name: "Ekle" }).click();
    await expect(page.getByRole("button", { name: /^Can Öztürk başlangıç saati: \d\d:\d\d$/ }).first()).toBeVisible();
  });
});
