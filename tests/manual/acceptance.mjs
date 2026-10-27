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
  await svc.from("shift_requests").delete().in("user_id", TEST_IDS);
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
  await check("employee cannot open Onay / Çalışanlar", async () => {
    for (const p of ["/onay", "/calisanlar"]) {
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

// ================= SHIFT REQUESTS: employee asks → yönetici decides → publish =================
{
  const amsToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
  const addDays = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n, 12)).toISOString().slice(0, 10); };
  const curMonday = addDays(amsToday, -((new Date(`${amsToday}T12:00:00Z`).getUTCDay() + 6) % 7));
  // furthest week employees may ask for — far enough ahead to hold no real data
  const W = addDays(curMonday, 56);
  const { data: depijp } = await svc.from("branches").select("id").eq("slug", "de-pijp").single();
  const { data: existingPub } = await svc.from("shift_week_publications").select("week_start").eq("branch_id", depijp.id).eq("week_start", W);
  const { count: realShifts } = await svc.from("shifts").select("id", { count: "exact", head: true }).eq("branch_id", depijp.id).gte("work_date", W).lte("work_date", addDays(W, 6));
  const safeWeek = !existingPub?.length && !realShifts;

  const emp = await login("test.ahmet");
  await check("employee: nav has Haftalık program", async () => {
    expect(await emp.page.getByRole("link", { name: "Program", exact: true }).first().isVisible(), "no nav link");
  });
  await check("employee home: 'Gelecek hafta için gün iste' card", async () => {
    expect(await emp.page.getByRole("link", { name: /Gelecek hafta için gün iste/ }).isVisible(), "no card");
  });
  await go(emp.page, `/program?hafta=${W}`);
  await check("employee: request form for a future week", async () => {
    expect(safeWeek, `week ${W} already has real data — skipped`);
    await emp.page.getByRole("heading", { name: "Program isteğim" }).waitFor({ timeout: 10000 });
  });
  await check("employee: pick Pazartesi + Çarşamba 18:00, send", async () => {
    await tap(emp.page.getByRole("button", { name: /^Pazartesi .* çalışabilirim$/ }));
    await tap(emp.page.getByRole("button", { name: /^Çarşamba .* çalışabilirim$/ }));
    await pickTime(emp.page, emp.page, /^Çarşamba başlangıç saati:/, "18:00");
    await emp.page.getByLabel("Not (isteğe bağlı)").fill("Test notu");
    await tap(emp.page.getByRole("button", { name: /Onaya gönder \(2 gün\)/ }));
    await emp.page.getByText("2 gün onaya gönderildi").waitFor({ timeout: 10000 });
  });
  await check("employee: requests show Bekliyor after reload", async () => {
    await go(emp.page, `/program?hafta=${W}`);
    const n = await emp.page.getByText("Bekliyor", { exact: true }).count();
    expect(n === 2, `${n} pending`);
  });
  await quality(emp.page, "employee program request");
  await check("employee: cannot request current week / write directly / approve (DB)", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await anon.auth.signInWithPassword({ email: "test.ahmet@staff.pizzadam.invalid", password: pw("test.ahmet") });
    const { error } = await anon.rpc("submit_shift_requests", { p_branch: depijp.id, p_week: curMonday, p_days: [] });
    expect(error && /gelecek haftalar/.test(error.message), error?.message ?? "accepted");
    const { error: direct } = await anon.from("shift_requests").insert({ branch_id: depijp.id, user_id: idOf["test.ahmet"], work_date: W, start_time: "10:00" });
    expect(direct, "direct insert allowed");
    const { error: decide } = await anon.rpc("approve_pending_shift_requests", { p_branch: depijp.id, p_week: W });
    expect(decide, "employee could approve");
    const { error: pub } = await anon.from("shift_week_publications").insert({ branch_id: depijp.id, week_start: W });
    expect(pub, "employee could publish");
  });

  const mgr = await login("yonetici.pijp");
  await check("patron home: pending request reminder", async () => {
    await mgr.page.getByText(/program isteği onay bekliyor/).waitFor({ timeout: 10000 });
  });
  await go(mgr.page, `/program?hafta=${W}`);
  const panel = mgr.page.getByRole("region", { name: "Gelen istekler" });
  const dayGroup = (day) => panel.locator("li", { has: mgr.page.getByRole("heading", { name: new RegExp(`^${day}`) }) });
  const boardDay = (i) => mgr.page.locator("section[aria-label='Haftalık program'] > ol > li").nth(i);
  await check("yönetici: sees both requests + Taslak badge + note", async () => {
    await panel.getByText("2 istek onay bekliyor").waitFor({ timeout: 10000 });
    expect(await mgr.page.getByText("Taslak", { exact: true }).first().isVisible(), "no Taslak");
    expect(await panel.getByText("“Test notu”").first().isVisible(), "note missing");
  });
  await quality(mgr.page, "manager program requests");
  await check("yönetici: Onayla puts Pazartesi on the board", async () => {
    await tap(dayGroup("Pazartesi").getByRole("button", { name: "Onayla" }));
    await dayGroup("Pazartesi").getByText("Onaylandı").waitFor({ timeout: 10000 });
    await boardDay(0).getByRole("button", { name: /^Test Ahmet başlangıç saati: 16:45/ }).waitFor({ timeout: 10000 });
  });
  await check("yönetici: edit time approves Çarşamba at 18:30", async () => {
    await pickTime(dayGroup("Çarşamba"), mgr.page, /^Test Ahmet başlangıç saati:/, "18:30");
    await dayGroup("Çarşamba").getByText("Onaylandı").waitFor({ timeout: 10000 });
    await boardDay(2).getByRole("button", { name: /^Test Ahmet başlangıç saati: 18:30/ }).waitFor({ timeout: 10000 });
  });
  await check("employee: decisions shown, unpublished board hidden", async () => {
    await go(emp.page, `/program?hafta=${W}`);
    expect(await emp.page.getByRole("heading", { name: "Program isteğim" }).isVisible(), "board visible before publish");
    const n = await emp.page.getByText("Onaylandı", { exact: true }).count();
    expect(n === 2, `${n} approved shown`);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await anon.auth.signInWithPassword({ email: "test.ahmet@staff.pizzadam.invalid", password: pw("test.ahmet") });
    const { data } = await anon.from("shifts").select("id").eq("branch_id", depijp.id).gte("work_date", W).lte("work_date", addDays(W, 6));
    expect((data ?? []).length === 0, `${data?.length} draft shifts readable`);
  });
  await check("yönetici: Programı yayınla", async () => {
    await tap(mgr.page.getByRole("button", { name: "Programı yayınla" }));
    await mgr.page.getByRole("button", { name: "Yayından kaldır" }).waitFor({ timeout: 10000 });
  });
  await check("employee: published week on Program + home", async () => {
    await go(emp.page, `/program?hafta=${W}`);
    await emp.page.getByText("Test Ahmet (sen)").first().waitFor({ timeout: 10000 });
    expect(await emp.page.getByText("18:30").first().isVisible(), "edited time missing");
    await go(emp.page, `?hafta=${W}`);
    await emp.page.getByText("Test Ahmet (sen)").first().waitFor({ timeout: 10000 });
  });
  await check("yönetici: Yayından kaldır hides it again", async () => {
    await tap(mgr.page.getByRole("button", { name: "Yayından kaldır" }));
    await mgr.page.getByRole("button", { name: "Programı yayınla" }).waitFor({ timeout: 10000 });
    await go(emp.page, `?hafta=${W}`);
    await emp.page.getByText("henüz yayınlanmadı").waitFor({ timeout: 10000 });
  });
  if (safeWeek) await svc.from("shift_week_publications").delete().eq("branch_id", depijp.id).eq("week_start", W);
  await emp.ctx.close();
  await mgr.ctx.close();
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

// ================= MANAGER: edit + permanently delete a throwaway employee (D-44) =================
{
  const domain = process.env.STAFF_EMAIL_DOMAIN;
  const tmpPass = `Gecici-${Date.now()}`;
  const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 });
  for (const u of list.users.filter((u) => /^test\.(silinecek|silindi)@/.test(u.email ?? ""))) {
    await svc.auth.admin.deleteUser(u.id);
  }
  const { data: branch } = await svc.from("branches").select("id").eq("slug", "de-pijp").single();
  const { data: created } = await svc.auth.admin.createUser({
    email: `test.silinecek@${domain}`, password: tmpPass, email_confirm: true,
  });
  const tmpId = created.user.id;
  await svc.from("profiles").insert({ id: tmpId, full_name: "Test Silinecek", username: "test.silinecek", role: "employee", started_on: "2026-10-01" });
  await svc.from("branch_members").insert({ user_id: tmpId, branch_id: branch.id });
  await svc.from("payments").insert({ user_id: tmpId, branch_id: branch.id, month: "2026-10-01", kind: "advance", amount: 10, paid_on: "2026-10-02" });

  const signIn = async (username) => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { error } = await anon.auth.signInWithPassword({ email: `${username}@${domain}`, password: tmpPass });
    return !error;
  };

  const { ctx, page } = await login("yonetici.pijp");
  await go(page, `/calisanlar/${tmpId}`);
  await check("Bilgileri düzenle: name + username + start date saved", async () => {
    await tap(page.getByRole("button", { name: "Bilgileri düzenle" }));
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Ad soyad").fill("Test Silindi");
    await dialog.getByLabel("Kullanıcı adı").fill("test.silindi");
    await dialog.getByLabel("Başlangıç tarihi").fill("2026-09-15");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await page.getByText("Bilgiler güncellendi").waitFor({ timeout: 10000 });
    const { data: p } = await svc.from("profiles").select("full_name, username, started_on").eq("id", tmpId).single();
    expect(p.full_name === "Test Silindi" && p.username === "test.silindi" && p.started_on === "2026-09-15", JSON.stringify(p));
  });
  await check("renamed user logs in with the new username only", async () => {
    expect(await signIn("test.silindi"), "new username rejected");
    expect(!(await signIn("test.silinecek")), "old username still works");
  });
  await check("Bilgileri düzenle: taken username is refused", async () => {
    await tap(page.getByRole("button", { name: "Bilgileri düzenle" }));
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Kullanıcı adı").fill("test.ahmet");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await page.getByText("Bu kullanıcı adı zaten alınmış.").waitFor({ timeout: 10000 });
    await page.keyboard.press("Escape");
  });
  await check("Hesabı sil: button stays disabled until the username is typed", async () => {
    await tap(page.getByRole("button", { name: "Hesabı sil" }));
    const dialog = page.getByRole("dialog");
    const del = dialog.getByRole("button", { name: "Kalıcı olarak sil" });
    expect(await del.isDisabled(), "enabled without confirmation");
    await dialog.getByLabel(/Onaylamak için/).fill("test.yanlis");
    expect(await del.isDisabled(), "enabled with a wrong username");
    await dialog.getByLabel(/Onaylamak için/).fill("test.silindi");
    await del.click();
    await page.waitForURL(/\/calisanlar$/, { timeout: 15000 });
  });
  await check("deleted account is gone (profile, payments, login)", async () => {
    const { data: p } = await svc.from("profiles").select("id").eq("id", tmpId).maybeSingle();
    const { data: pay } = await svc.from("payments").select("id").eq("user_id", tmpId);
    expect(!p && pay.length === 0, "rows left behind");
    expect(!(await signIn("test.silindi")), "deleted user can still log in");
  });
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
