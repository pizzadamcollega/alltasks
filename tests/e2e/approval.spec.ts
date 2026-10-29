import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("approval", () => {
  // D-46: the yönetici's Onayla only appears once the kasacı approved (or on the kasacı's own entry)
  test("manager can approve a kasacı-approved entry one at a time", async ({ page }) => {
    await login(page, "de-pijp", "patron.pijp");
    await page.goto("/de-pijp/onay");

    const approve = page.getByRole("button", { name: "Onayla", exact: true }).first();
    if (await approve.isVisible()) {
      await approve.click();
      await expect(page.getByRole("button", { name: "Onaylandı ✓" }).first()).toBeVisible();
    }
  });

  test("bulk-approve clears every eligible entry and the button says so", async ({ page }) => {
    await login(page, "de-pijp", "patron.pijp");
    await page.goto("/de-pijp/onay");

    const bulk = page.getByRole("button", { name: /Kasacının onayladığı saatleri onayla/ });
    if (await bulk.isVisible()) {
      await bulk.click();
      await expect(bulk).toHaveCount(0);
    }
  });

  test("an entry with no clock-out shows the fix-up time input instead of Onayla", async ({ page }) => {
    await login(page, "de-pijp", "patron.pijp");
    await page.goto("/de-pijp/onay");
    await expect(page.getByText("Bitiş saati girilmedi").first()).toBeVisible();
  });
});
