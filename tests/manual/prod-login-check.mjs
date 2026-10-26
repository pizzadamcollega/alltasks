import { chromium } from "playwright";

// Credentials come from the owner's local .env.local (LOGIN_FURKAN_*), never from the repo.
process.loadEnvFile(".env.local");

const BASE = "https://alltasks-mauve.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (msg) => console.log("[console]", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("response", (res) => {
  if (res.status() >= 400) console.log("[http]", res.status(), res.url());
});

await page.goto(`${BASE}/de-pijp/giris`, { waitUntil: "networkidle" });
await page.getByLabel("Kullanıcı adı").fill(process.env.LOGIN_FURKAN_USER);
await page.locator("#password").fill(process.env.LOGIN_FURKAN_PASS);
await page.getByRole("button", { name: "Giriş yap" }).click();
await page.waitForTimeout(6000);
await page.waitForLoadState("networkidle").catch(() => {});

console.log("URL after login:", page.url());
console.log("Full body text:", (await page.locator("main").innerText().catch(() => page.locator("body").innerText())));

await page.screenshot({ path: "tests/manual/shots/prod-after-login.png", fullPage: true });
await browser.close();
