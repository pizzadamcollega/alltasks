import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("payments", () => {
  test("a hidden advance stays invisible to the employee until the manager toggles it visible", async ({
    browser,
  }) => {
    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    await login(managerPage, "de-pijp", "patron.pijp");
    await managerPage.goto("/de-pijp/calisanlar");
    await managerPage.getByText("Ahmet Yılmaz").click();

    await managerPage.getByRole("button", { name: "Ekle" }).click();
    await managerPage.getByLabel("Tutar (€)").fill("150");
    await managerPage.getByRole("button", { name: "Kaydet", exact: true }).click();

    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();
    await login(employeePage, "de-pijp", "ahmet");
    await employeePage.goto("/de-pijp/gecmis");
    await expect(employeePage.getByText("Ödemeler", { exact: true })).toHaveCount(0);

    await managerPage.getByRole("switch").first().click();

    await employeePage.reload();
    await expect(employeePage.getByText("Ödemeler", { exact: true })).toBeVisible();
    await expect(employeePage.getByText("Patronunun seninle paylaştığı ödeme bilgileri.")).toBeVisible();

    await managerContext.close();
    await employeeContext.close();
  });
});
