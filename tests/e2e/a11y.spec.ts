import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./helpers";

interface Route {
  path: string;
  loginAs?: string;
}

const ROUTES: Route[] = [
  { path: "/de-pijp/giris" },
  { path: "/de-pijp", loginAs: "ahmet" },
  { path: "/de-pijp/gecmis", loginAs: "ahmet" },
  { path: "/de-pijp/profil", loginAs: "ahmet" },
  { path: "/de-pijp", loginAs: "patron.pijp" },
  { path: "/de-pijp/onay", loginAs: "patron.pijp" },
  { path: "/de-pijp/calisanlar", loginAs: "patron.pijp" },
];

async function goTo(page: Page, route: Route) {
  if (route.loginAs) {
    await login(page, "de-pijp", route.loginAs);
  }
  await page.goto(route.path);
}

/** CLAUDE.md golden rule 7 / docs/TEST-PLAN.md: 0 serious/critical axe violations, light and dark. */
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`a11y (${colorScheme})`, () => {
    test.use({ colorScheme });

    for (const route of ROUTES) {
      const label = route.loginAs ? `${route.path} (as ${route.loginAs})` : route.path;
      test(`${label} has no serious or critical violations`, async ({ page }) => {
        await goTo(page, route);
        const results = await new AxeBuilder({ page }).analyze();
        const serious = results.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        );
        expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
      });
    }
  });
}
