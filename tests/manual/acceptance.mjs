// Pizzadam acceptance suite — run from the project root:
//   node tests/manual/acceptance.mjs [BASE]   (default http://localhost:3000; needs LOGIN_* in .env.local)
// Creates data only for test.* accounts and removes only that data at the end.
import { chromium } from "playwright";
import AxeBuilderPkg from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");
const AxeBuilder = AxeBuilderPkg.default ?? AxeBuilderPkg;
const BASE = process.argv[2] ?? "http://localhost:3000";
const pw = (u) => process.env[`LOGIN_${u.toUpperCase().replace(/\./g, "_")}_PASS`];
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = [];
async function check(name, fn) {
  try {
    const r = await fn();
    if (r === false) throw new Error("returned false");
    results.push({ name, ok: true });
    console.log("✓", name);
  } catch (e) {
    results.push({ name, ok: false, why: String(e.message ?? e).split("\n")[0].slice(0, 160) });
    console.log("✗", name, "—", String(e.message ?? e).split("\n")[0].slice(0, 160));
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---------- test-data reset (test accounts only) ----------
const { data: profiles } = await svc.from("profiles").select("id, username");
const idOf = Object.fromEntries(profiles.map((p) => [p.username, p.id]));
const TEST_IDS = ["test.ahmet", "test.murat"].map((u) => idOf[u]);
async function resetTestData() {
  await svc.from("time_entries").delete().in("user_id", TEST_IDS);
  await svc.from("shifts").delete().in("user_id", TEST_IDS);
  await svc.from("payments").delete().in("user_id", TEST_IDS);
  await svc.from("wage_rates").delete().in("user_id", TEST_IDS).neq("effective_from", "2026-10-01");
}
await resetTestData();

// ---------- per-page quality checks ----------
const pageErrors = [];
async function quality(page, label) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await check(`[${label}] no horizontal overflow`, async () => {
    const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(o <= 0, `${o}px overflow`);
  });
  await check(`[${label}] touch targets >= 44px`, async () => {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button, input:not([type=hidden]), select, [role=radio], [role=tab], nav a, a.flex")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          if (!r.width || s.visibility === "hidden" || s.opacity === "0" || el.closest("[aria-hidden=true]")) return false;
          if (el.type === "checkbox" || el.type === "radio" || el.getAttribute("role") === "switch") return false; // wrapped in a 44px label
          const label = el.closest("label");
          if (label && label.getBoundingClientRect().height >= 43.5) return false; // the label is the target
          if (r.width <= 1 && r.height <= 1) return false; // sr-only
          return r.height < 43.5;
        })
        .map((el) => `${el.tagName.toLowerCase()}("${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20)}" ${Math.round(el.getBoundingClientRect().height)}px)`),
    );
    expect(small.length === 0, small.slice(0, 4).join(", "));
  });
  await check(`[${label}] axe: no serious/critical`, async () => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.length === 0, bad.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0]?.target}`).join("; "));
  });
}

const browser = await chromium.launch();
async function login(user, slug = "de-pijp", viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${user}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Download the React DevTools/.test(m.text())) pageErrors.push(`${user} console: ${m.text().slice(0, 120)}`); });
  await page.goto(`${BASE}/${slug}/giris`);
  await page.getByLabel("Kullanıcı adı").fill(user);
  await page.locator("#password").fill(pw(user));
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/giris"), { timeout: 30000 });
  return { ctx, page };
}
async function pickTime(scope, page, buttonName, time) {
  const [h, m] = time.split(":");
  await scope.getByRole("button", { name: buttonName }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: h, exact: true }).click();
  await sheet.getByRole("button", { name: `:${m}`, exact: true }).click();
  await sheet.waitFor({ state: "detached", timeout: 5000 });
}
// scroll to the middle first so the fixed bottom nav never sits on top of the target
const tap = async (locator) => { await locator.evaluate((el) => el.scrollIntoView({ block: "center" })); await locator.click(); };
const go = async (page, path) => { await page.goto(`${BASE}/de-pijp${path}`); await page.waitForLoadState("networkidle").catch(() => {}); };
const yesterday = (() => { const d = new Date(Date.now() - 864e5); return d.toISOString().slice(0, 10); })();

// ================= AUTH =================
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/de-pijp/giris`);
  await check("login page renders", async () => expect(await page.getByRole("button", { name: "Giriş yap" }).isVisible(), "no button"));
  await quality(page, "giris");
  await check("wrong password shows an error", async () => {
    await page.getByLabel("Kullanıcı adı").fill("test.ahmet");
    await page.locator("#password").fill("yanlis-sifre-123");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await page.getByRole("alert").waitFor({ timeout: 10000 });
  });
  await check("signed-out visitor is sent to login", async () => {
    await page.goto(`${BASE}/de-pijp/gecmis`);
    expect(page.url().includes("/giris"), page.url());
  });
  await ctx.close();
}

// ================= MANAGER sets up the week =================
{
  const { ctx, page } = await login("yonetici.pijp");
  await check("patron home: stats + calendar + Programı düzenle", async () => {
    expect(await page.getByText("personel gideri").isVisible(), "no cost stat");
    expect(await page.getByRole("region", { name: "Haftalık program" }).isVisible(), "no calendar");
    expect(await page.getByRole("link", { name: "Programı düzenle" }).isVisible(), "no edit link");
  });
  await quality(page, "patron home");

  await go(page, "/program");
  const today = page.locator('li[aria-current="date"]');
  await check("program: add Test Ahmet today via time picker", async () => {
    await today.getByRole("button", { name: "Kişi ekle" }).click();
    await today.getByLabel("Çalışan").selectOption({ label: "Test Ahmet" });
    await pickTime(today, page, /^Başlangıç saati:/, "16:45");
    await today.getByRole("button", { name: "Ekle" }).click();
    await today.getByRole("button", { name: /^Test Ahmet başlangıç saati: 16:45/ }).waitFor({ timeout: 10000 });
  });
  await check("program: change start time inline", async () => {
    await pickTime(today, page, /^Test Ahmet başlangıç saati:/, "17:30");
    await today.getByRole("button", { name: /^Test Ahmet başlangıç saati: 17:30/ }).waitFor({ timeout: 10000 });
  });
  await check("program: add + remove someone on tomorrow", async () => {
    const tomorrow = today.locator("xpath=following-sibling::li[1]");
    if (!(await tomorrow.count())) return; // Sunday: no next day in this week
    await tomorrow.getByRole("button", { name: "Kişi ekle" }).click();
    await tomorrow.getByLabel("Çalışan").selectOption({ label: "Test Ahmet" });
    await tomorrow.getByRole("button", { name: "Ekle" }).click();
    const remove = tomorrow.getByRole("button", { name: "Test Ahmet programdan çıkar" });
    await remove.waitFor({ timeout: 10000 });
    await remove.click();
    await remove.waitFor({ state: "detached", timeout: 10000 });
  });
  await check("program: copy previous week gives feedback", async () => {
    await page.getByRole("button", { name: "Geçen haftayı kopyala" }).click();
    await page.locator("[data-sonner-toast]").first().waitFor({ timeout: 10000 });
  });
  await check("program: next week arrow changes the range", async () => {
    const before = await page.getByRole("region", { name: "Haftalık program" }).locator("p").first().textContent();
    await page.getByRole("link", { name: "Sonraki hafta" }).click();
    await page.waitForURL(/hafta=/);
    const after = await page.getByRole("region", { name: "Haftalık program" }).locator("p").first().textContent();
    expect(before !== after, `${before} = ${after}`);
  });
  await go(page, "/program");
  await quality(page, "program");
  await check("yönetici: no Yöneticiler tab, Yeni yönetici blocked", async () => {
    await go(page, "/calisanlar");
    expect((await page.getByRole("link", { name: "Yöneticiler" }).count()) === 0, "tab visible");
    await go(page, "/calisanlar/yonetici/yeni");
    expect(!page.url().includes("yonetici/yeni"), "not redirected");
  });
  await check("yönetici blocked from the other branch", async () => {
    await page.goto(`${BASE}/zuid`);
    expect(page.url().includes("/giris"), page.url());
  });
  await ctx.close();
}

// ================= EMPLOYEE =================
{
  const { ctx, page } = await login("test.ahmet");
  await check("employee home: no Başla/Bitir", async () => expect((await page.getByRole("button", { name: /^(Başla|Bitir)$/ }).count()) === 0, "timer visible"));
  await check("employee home: calendar shows own shift (sen) + Bugün", async () => {
    const board = page.getByRole("region", { name: "Haftalık program" });
    expect(await board.getByText("Test Ahmet (sen)").isVisible(), "own shift missing");
    expect(await board.getByText("Bugün", { exact: true }).isVisible(), "Bugün missing");
  });
  await check("start time pre-filled from today's program (17:30)", async () =>
    expect(await page.getByRole("button", { name: /^Başlangıç: 17:30/ }).isVisible(), "not prefilled"));
  await check("day chips: Bugün selected, Dün available", async () => {
    expect((await page.getByRole("radio", { name: /Bugün/ }).getAttribute("aria-checked")) === "true", "Bugün not selected");
    expect(await page.getByRole("radio", { name: /Dün/ }).isVisible(), "no Dün");
  });
  await quality(page, "employee home");
  await check("time picker sheet passes axe", async () => {
    await page.getByRole("button", { name: /^Bitiş:/ }).click();
    await page.getByRole("dialog").waitFor();
    // let the slide/fade-in finish; mid-animation opacity reads as low contrast
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    await page.keyboard.press("Escape");
    expect(bad.length === 0, bad.map((v) => v.id).join(","));
  });
  await check("manual entry: yesterday 17:00 → 01:30 saved as Elle girildi", async () => {
    await page.getByRole("radio", { name: /Dün/ }).click();
    await pickTime(page, page, /^Başlangıç:/, "17:00");
    await pickTime(page, page, /^Bitiş:/, "01:30");
    expect(await page.getByText("bitiş ertesi gün").isVisible(), "no next-day hint");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await page.getByText("Kayıt eklendi").waitFor({ timeout: 15000 });
    await page.getByText("Elle girildi").first().waitFor({ timeout: 10000 });
  });
  await check("manual entry: amount uses the wage (8 sa 30 dk = €119)", async () => {
    await page.reload();
    await page.getByText("€119,00").first().waitFor({ timeout: 10000 });
  });
  await check("manual entry: overlap refused with message", async () => {
    await page.getByRole("radio", { name: /Dün/ }).click();
    await pickTime(page, page, /^Başlangıç:/, "18:00");
    await pickTime(page, page, /^Bitiş:/, "20:00");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await page.getByRole("alert").filter({ hasText: "Bu saatlerde zaten bir kaydın var" }).waitFor({ timeout: 10000 });
  });
  await check("manual entry: form cleared after save", async () => {
    await page.reload();
    expect(await page.getByRole("button", { name: /^Bitiş: seçilmedi/ }).isVisible(), "not cleared");
  });
  await check("manual entry: 'Başka gün' opens a date input", async () =>
    expect((await page.locator('input[type="date"]').count()) === 1, "no native date input"));

  await go(page, "/gecmis");
  await check("Geçmiş shows the entry", async () => { await page.getByText("17:00 – 01:30").first().waitFor({ timeout: 10000 }); });
  await check("Geçmiş tabs switch (Haftalık, Aylık)", async () => {
    await page.getByRole("link", { name: "Haftalık" }).click();
    await page.waitForURL(/sekme=haftalik/);
    await page.getByRole("link", { name: "Aylık" }).click();
    await page.waitForURL(/sekme=aylik/);
  });
  await quality(page, "gecmis");
  await go(page, "/profil");
  await check("profil renders with theme + password", async () => {
    expect(await page.getByRole("radiogroup", { name: "Görünüm" }).isVisible(), "no theme");
    expect(await page.getByText(/Şifre/).first().isVisible(), "no password");
  });
  await quality(page, "profil");
  await check("employee cannot open Onay / Program / Çalışanlar", async () => {
    for (const p of ["/onay", "/program", "/calisanlar"]) {
      await go(page, p);
      expect(!page.url().includes(p), `${p} reachable`);
    }
  });
  await check("employee blocked from the other branch", async () => {
    await page.goto(`${BASE}/zuid`);
    expect(page.url().includes("/giris"), page.url());
  });
  await ctx.close();
}

// ================= MANAGER: Onay + employee management =================
{
  const { ctx, page } = await login("yonetici.pijp");
  await go(page, `/onay?gun=${yesterday}`);
  await check("Onay: employee's hand entry is listed", async () => { await page.getByText("Test Ahmet").first().waitFor({ timeout: 10000 }); });
  await quality(page, "onay");
  await check("Onay: Düzenle with pickers saves a new end time", async () => {
    const card = page.locator("div.rounded-card").filter({ hasText: "Test Ahmet" }).first();
    await card.getByRole("button", { name: "Düzenle" }).click();
    await pickTime(card, page, /^Bitiş:/, "01:00");
    await card.getByRole("button", { name: "Kaydet" }).click();
    await page.getByText("17:00 – 01:00").first().waitFor({ timeout: 10000 });
  });
  await check("Onay: Kayıt ekle with pickers on the viewed day", async () => {
    await page.getByRole("button", { name: "Kayıt ekle" }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Test Ahmet" }).click();
    const form = page.locator("form").filter({ hasText: "kayıt ekle" });
    await pickTime(form, page, /^Başlangıç:/, "12:00");
    await pickTime(form, page, /^Bitiş:/, "14:00");
    await form.getByRole("button", { name: "Ekle" }).click();
    await page.getByText("12:00 – 14:00").first().waitFor({ timeout: 10000 });
  });
  await check("Onay: approve-all leaves nothing pending", async () => {
    const btn = page.getByRole("button", { name: /kaydı onayla$/ });
    if (await btn.count()) { await btn.click(); }
    await page.getByRole("button", { name: "Tümü onaylandı" }).waitFor({ timeout: 10000 });
  });
  await go(page, "/calisanlar");
  await check("Çalışanlar lists Test Ahmet", async () => { await page.getByText("test.ahmet").waitFor({ timeout: 10000 }); });
  await quality(page, "calisanlar");
  await page.getByText("test.ahmet").click();
  await page.waitForURL(/calisanlar\/[0-9a-f-]{36}/);
  await quality(page, "calisan profil");
  await check("Ücreti değiştir (future date) appears in history", async () => {
    await tap(page.getByRole("button", { name: "Ücreti değiştir" }));
    await page.getByLabel("Yeni ücret (€)").fill("15");
    await tap(page.locator("form").filter({ has: page.getByLabel("Yeni ücret (€)") }).getByRole("button", { name: /kaydet/i }));
    await page.getByText("€15,00").first().waitFor({ timeout: 10000 });
  });
  await check("Ödeme ekle (hidden advance) is listed", async () => {
    await tap(page.getByRole("button", { name: /^Ekle$/ }).first());
    const amount = page.getByLabel(/Tutar/).first();
    await amount.fill("50");
    const kind = page.getByLabel(/Tür/).first();
    if (await kind.count()) await kind.click().then(() => page.getByRole("option", { name: /Avans/ }).click()).catch(() => {});
    await page.getByRole("button", { name: /^(Kaydet|Ekle)$/ }).last().click();
    await page.getByText("€50,00").first().waitFor({ timeout: 10000 });
  });
  await check("Şifreyi sıfırla works (reset to the same password)", async () => {
    await tap(page.getByRole("button", { name: "Şifreyi sıfırla" }).first());
    await page.getByRole("dialog").locator("#newPassword").fill(pw("test.ahmet"));
    await page.getByRole("dialog").getByRole("button", { name: "Şifreyi sıfırla" }).click();
    await page.getByText("Şifre sıfırlandı").waitFor({ timeout: 10000 });
  });
  await go(page, "/calisanlar/yeni");
  await quality(page, "yeni calisan");
  await ctx.close();
}

// ================= ADMIN =================
{
  const { ctx, page } = await login("furkan");
  await check("admin: branch switcher reaches Zuid", async () => {
    await page.getByRole("button", { name: /Pizzadam De Pijp/ }).click();
    await page.getByRole("menuitem", { name: "Pizzadam Zuid" }).click();
    await page.waitForURL(/\/zuid/);
  });
  await check("admin: Yöneticiler tab lists both managers", async () => {
    await go(page, "/calisanlar?sekme=yoneticiler");
    await page.getByText("yonetici.pijp").waitFor();
    await page.getByText("yonetici.zuid").waitFor();
  });
  await quality(page, "yoneticiler");
  await check("admin: Yeni çalışan offers Şubeler checkboxes", async () => {
    await go(page, "/calisanlar/yeni");
    await page.getByText("Şubeler").waitFor();
  });
  await go(page, "/calisanlar/yonetici/yeni");
  await quality(page, "yeni yonetici");
  await ctx.close();
}

// ================= DESKTOP =================
{
  const { ctx, page } = await login("test.ahmet", "de-pijp", { width: 1280, height: 900 });
  await quality(page, "desktop employee home");
  await check("desktop: calendar is 7 columns", async () => {
    const cols = await page.locator('section[aria-label="Haftalık program"] ol').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(cols === 7, `${cols} columns`);
  });
  await ctx.close();
}

await check("no page errors / console errors", async () => expect(pageErrors.length === 0, [...new Set(pageErrors)].slice(0, 3).join(" | ")));

await browser.close();
await resetTestData();
const passed = results.filter((r) => r.ok).length;
console.log(`\nSCORE ${passed}/${results.length} = ${((passed / results.length) * 100).toFixed(1)}%`);
for (const r of results.filter((r) => !r.ok)) console.log(" FAIL", r.name, "—", r.why);
