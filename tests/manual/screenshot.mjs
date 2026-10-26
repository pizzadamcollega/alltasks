import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";

const outDir = "tests/manual/shots";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

async function shot(name, viewport, path, colorScheme = "light") {
  const context = await browser.newContext({ ...viewport, colorScheme });
  const page = await context.newPage();
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await context.close();
  console.log(`${name}: ok${errors.length ? " (console errors: " + errors.join(" | ") + ")" : ""}`);
}

await shot("01-root-light", devices["iPhone 13"], "/", "light");
await shot("02-root-dark", devices["iPhone 13"], "/", "dark");
await shot("03-giris-light", devices["iPhone 13"], "/de-pijp/giris", "light");
await shot("04-giris-dark", devices["iPhone 13"], "/de-pijp/giris", "dark");
await shot("05-giris-desktop", { viewport: { width: 1280, height: 900 } }, "/de-pijp/giris", "light");

await browser.close();
console.log("done");
