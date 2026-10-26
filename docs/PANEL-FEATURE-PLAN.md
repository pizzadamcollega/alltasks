# Ücret & Mesai Paneli — Feature Plan & Build Log

Business-analyst-level record of what the "ücret ve mesai paneli" (employee + manager wage/hours
panel) actually is in this codebase, the scope cut agreed with the owner, and what is built vs.
still open. Read this alongside `CLAUDE.md` (read-first order) — it does not repeat SPEC/SCREENS/
ARCHITECTURE/DESIGN, it records the decisions and status specific to this feature round.

## 0. Live infrastructure (as of 2026-10-27)

| What | Where |
| --- | --- |
| Supabase project | `sfpjvslasvzigpyfftyf`, region **eu-central-1** (Frankfurt). All migrations + `seed.sql` applied. Old Seoul project `fgpjzqybsijlasuoklen` is no longer used (D-40). |
| DB connection (local/CI only) | Session pooler, `.env.local`'s `SUPABASE_DB_URL` (D-29) — never set this on Vercel. |
| GitHub | `https://github.com/pizzadamcollega/alltasks.git`, branch `main`, pushed. |
| Vercel | `https://alltasks-mauve.vercel.app` — deployed, **login confirmed working end-to-end**. |
| Accounts | admin `furkan`; yönetici `yonetici.pijp` (De Pijp), `yonetici.zuid` (Zuid); test çalışan `test.ahmet` (De Pijp), `test.murat` (Zuid), €14/sa. Passwords only in local `.env.local` `LOGIN_*`. Old `admin` deactivated. |

Vercel env vars were initially missing `STAFF_EMAIL_DOMAIN` / `APP_BASE_URL` (login failed with
"Sunucu yapılandırması eksik" — that string only appears when `STAFF_EMAIL_DOMAIN` is unset, see
`app/[branch]/giris/actions.ts`). `SUPABASE_SERVICE_ROLE_KEY` etc. were already present from the
Vercel↔Supabase marketplace integration. **Fixed 2026-10-27**: `vercel link --project alltasks`,
`vercel env add STAFF_EMAIL_DOMAIN production` / `APP_BASE_URL production`, then
`vercel --prod` to redeploy. Verified with `node tests/manual/prod-login-check.mjs`: admin login
→ redirects to `/de-pijp`, real Patron home renders with live (zeroed, since no data yet) Supabase
stats, 0 console errors. Re-run that script anytime something changes.

## 1. Framing

The "panel" was not a greenfield feature: SPEC §4–§6, SCREENS S2/S5/S8/S9/S12–S14 and the whole DB
schema (`supabase/migrations/20261025000001_init.sql`) already specified it in full, tested by
`supabase/tests/smoke.sql`. This round's job was to (a) scope a buildable slice, (b) resolve the
open risks that were blocking code, and (c) implement + test that slice — not to redesign the
product.

## 2. Scope decisions (owner-confirmed)

| Decision | Chosen | Deferred |
| --- | --- | --- |
| Roadmap phases | **0–5**: scaffold → design system → auth → employee home/Geçmiş → manager Onay → Çalışanlar/ücret/ödeme | 6–11: Program (vardiya), gün devri, izin, bildirimler, Raporlar/export, Ayarlar, PWA hardening |
| Overtime | **None.** "Mesai" = worked shift, always paid at the one effective hourly rate (matches the existing schema exactly) | A real fazla-mesai multiplier is net-new business logic, not attempted |
| Brand colour | Logo red `#BE1E2D` (`pizza.svg`), see DECISIONS D-23 | Final tint still owner's call if a style guide shows up later |
| Staff e-mail domain | `<username>@staff.pizzadam.invalid`, **to verify against the real Supabase project together** | Fallback is a real subdomain the owner controls, only if `.invalid` is rejected |

See DECISIONS.md D-23 .. D-27 for the exact entries this round added.

## 3. Ücret & Mesai field/permission matrix (as built)

| Data / action | Çalışan | Patron/Admin (own branch) | Where |
| --- | --- | --- | --- |
| Clock in/out (Başla/Bitir) | ✅ own, server time only | ❌ (patrons don't clock in, D-07) | `/[branch]` → `ClockCard`, `features/clock/*` |
| See own hours/earnings (day/week/month) | ✅ | — | `/[branch]`, `/[branch]/gecmis` |
| Edit own entry's start/end | ✅ while not approved | — | `features/entries/actions.ts#editOwnEntryAction` |
| See/edit **any** branch entry, incl. approved | ❌ | ✅ | `/[branch]/onay`, `managerUpdateEntryAction` |
| Add a missed entry for someone | ❌ | ✅ "+ Kayıt ekle" | `createManualEntryAction` |
| Approve entries (single / bulk) | ❌ | ✅ | `approveEntriesAction`, RPC `approve_entries` |
| See own current hourly rate | ✅ (Geçmiş summary only) | ✅ (also sees others') | `features/wages/queries.ts#getCurrentRate` |
| **Change** a wage | ❌ never | ✅ **except their own** (`user_id <> auth.uid()` in RLS) | `/[branch]/calisanlar/[id]`, `changeWageAction` |
| See payments/advances | ✅ only records marked visible | ✅ all | `getVisiblePayments` vs `getAllPaymentsForMonth` |
| Add/edit/delete a payment, toggle visibility | ❌ | ✅ | `features/payments/actions.ts` |
| Create an employee account | ❌ | ✅ (service-role, rights re-checked server-side); admin may pick several branches | `/[branch]/calisanlar/yeni`, `createEmployeeAction` |
| Create / manage a **yönetici** (patron, one branch) | ❌ | Admin only (patron ❌) | `/[branch]/calisanlar?sekme=yoneticiler`, `calisanlar/yonetici/*`, `createManagerAction` |
| Reset a password / (de)activate an account | ❌ | ✅ (own) | `AccountSection`, `resetPasswordAction` / `setActiveAction` |
| Change own theme / password | ✅ | ✅ | `/[branch]/profil` |

This matrix is the ground truth for "hangi alan kime açık" — it mirrors the RLS policies in the
migration exactly; nothing here is enforced only in the UI (CLAUDE.md golden rule 1).

## 4. What's built (Phase 0–5)

- **Scaffold**: Next.js 16 (App Router, Tailwind v4, shadcn/radix), Vitest, Playwright
  (mobile/desktop projects), ESLint flat config incl. a `no-restricted-imports` guard so
  `lib/supabase/admin` can only be imported from `features/accounts/**` / `scripts/**`.
- **Design system**: Pizzadam tokens (incl. the real brand red) wired into shadcn's variables so
  every primitive (Button, Switch, Dialog…) already matches the brand; `lib/time.ts` /
  `lib/money.ts` / `lib/earnings.ts` mirror the SQL rounding/business-day/money rules the DB
  enforces, each covered by unit tests using the exact example values from `docs/TEST-PLAN.md`.
- **Auth**: `proxy.ts` (session refresh + redirect-to-login), `lib/session.ts`
  (`requireSessionContext`, `React.cache`-memoized), S1 Giriş, S6 Profil (tema + şifre).
- **Employee panel**: S2 ana sayfa (ClockCard with a live timer, kazanç stats incl. a live estimate
  for a still-running shift) and S5 Geçmiş (Günlük/Haftalık/Aylık, own-entry edit sheet, visible
  Ödemeler block + Kalan — hidden entirely when there's nothing visible, per SPEC §6).
- **Manager panel**: S8 ana sayfa (bugün çalışanlar, günlük/aylık gider), S9 Gün sonu onayı
  (per-entry approve/edit, missing-clock-out fix-up, bulk "Kalan N kaydı onayla", "+ Kayıt ekle"),
  S12 Çalışanlar, S13 Çalışan profili (ücret değiştir + history, ödeme/avans CRUD + visibility,
  şifre sıfırlama, (de)aktifleştir), S14 Yeni çalışan.
- **Tests**: 35 Vitest unit tests (time/money/earnings/validation/aggregation — all green, see
  `npm test`); 58 Playwright specs across `auth`/`clock`/`approval`/`employees`/`payments`/`a11y`
  (light+dark) — written and verified to parse/list correctly (`npx playwright test --list`), not
  yet run end-to-end (needs a live local Supabase + seeded DB, see §5).
- **Verified locally** (no live Supabase needed for these): `npm run lint`, `npm run typecheck`,
  `npm test`, and `npm run build` all pass; manual `curl` smoke test confirmed the unauthenticated
  redirect chain, the branch-slug 404, and response security headers all behave correctly even
  against an unreachable Supabase URL.

## 5. Joint next steps (need the owner's Supabase/Vercel setup)

1. ~~Create the Supabase project and apply migrations~~ **Done 2026-10-27.** Project
   `fgpjzqybsijlasuoklen` (ap-northeast-2), both migrations applied and `supabase/seed.sql` loaded
   via `supabase db push --db-url <session-pooler-URI> --include-seed` (the direct `db.<ref>`
   hostname doesn't resolve on new projects — had to use the pooler URI, D-29). `branches` has
   `de-pijp`/`zuid`, confirmed via REST.
2. ~~Verify the `.invalid` staff e-mail domain~~ **Done 2026-10-27**, D-28. `npm run create-user
   -- --role admin --username admin ...` created `admin@staff.pizzadam.invalid` with no error.
   No fallback domain needed.
3. **Regenerate `types/database.ts`** for real — still blocked: `supabase gen types`, even with
   `--db-url`, shells out to a local Docker/Podman container (D-30), and there's no Docker in this
   environment. Run `npm run db:types` from a machine with Docker Desktop once convenient; the
   hand-authored version already matches the applied schema exactly, so this is a nice-to-have,
   not a blocker.
4. **Run the DB smoke tests** (`npm run test:db`, needs a local Postgres — not available here)
   and the **Playwright suite** (`supabase start && npm run db:seed-users && npm run test:e2e`,
   needs the local Supabase stack, i.e. Docker) — both still pending a machine with Docker.
5. ~~Git: push this repo~~ **Done 2026-10-27**: `https://github.com/pizzadamcollega/alltasks.git`, `main`.
6. ~~Vercel project: import the repo, fix env vars~~ **Done 2026-10-27**:
   `https://alltasks-mauve.vercel.app` is live and login works end-to-end (verified with
   `node tests/manual/prod-login-check.mjs`). Added `STAFF_EMAIL_DOMAIN` + `APP_BASE_URL` via
   `vercel env add ... production`; `SUPABASE_SERVICE_ROLE_KEY` and the rest were already there
   from the Vercel↔Supabase integration. **Remaining**: still on Hobby plan — move to Pro before
   real traffic (D-11; Hobby is non-commercial-use only). **Never** add `SUPABASE_DB_URL` on
   Vercel — it's local/CI-only (D-29).
7. Once the above are green, resume at ROADMAP Phase 6 (haftalık program) if/when the owner wants
   the rest of the ERP built.

## 6. Known simplifications (intentional, not bugs)

- Employee list/detail queries loop per branch rather than building a single mega-join — fine at
  the seeded scale (6–9 employees/branch); revisit only if a branch grows much larger.
- "Bugün çalışanlar" / live "Bugün" estimates compute elapsed time at render time (Server
  Components), not a client-ticking timer — acceptable since a page refresh updates it, same as
  SPEC's "tahmini" framing already implies.
- `datetime-local` inputs are read as Amsterdam wall-clock regardless of the device's own locale
  setting (`lib/time.ts#amsterdamLocalToISO`) — correct for on-site staff phones, would need
  revisiting if remote editing from another timezone is ever a real scenario.
- The "Düzenlendi" tag on an edited entry doesn't show the original time from `time_entry_audit`
  (ROADMAP Phase 4 acceptance) — only that it was edited. Pulling the audit row in is
  straightforward follow-up work if the owner wants it.
- No standalone `/dev/ui` component showcase (ROADMAP Phase 1) — components were built and checked
  directly against the real screens instead of a separate catalogue page.


## 7. Accounts round (2026-10-26)

- Admin "Çalışanlar | Yöneticiler" tabs; "Yeni yönetici" form (one branch, radio) and yönetici
  profile (branch + shared Hesap card). Patron never sees the tab; `/calisanlar/yonetici/*`
  redirects non-admins. Admin "Yeni çalışan" now has Şubeler checkboxes.
- **Fixed two real prod bugs** found while doing this: (1) `rpc("is_branch_manager", { branch })`
  / `rpc("manages_user", { user })` used the wrong argument names (SQL is `p_branch` / `p_user`),
  so PostgREST returned `PGRST202` and every create-employee / reset-password / (de)activate call
  answered "Bu işlem için yetkin yok." (D-34). (2) Saatlik ücret inputs had `step="0.05" min="0.01"`,
  which makes round values like `14` invalid in the browser, so the form never submitted.
- Verified on production with a Playwright run (scratch script, not committed): admin creates both
  yöneticiler via UI, each yönetici creates one çalışan, cross-branch access → login redirect,
  çalışan sees Başla and can't open Çalışanlar, old `admin` login → `user_banned`.

## 8. Program + manual hours round (2026-10-26)

- **Haftalık program** (`features/shifts/*`, `components/app/week-calendar.tsx`): Mon–Sun board on
  every home page, ‹ › week arrows (`?hafta=`). Past days grey + "Geçti", today green + "Bugün",
  future light blue; own name highlighted "(sen)". Phone: day cards stacked; desktop: 7 columns.
  Yönetici edits it on `/[branch]/program` (add person + start time, change time inline, remove,
  "Geçen haftayı kopyala"). Nav item "Program" for managers.
- **Elle saat girişi** replaces Başla/Bitir (D-37/D-38): form "Çalıştığım saatler" on the employee
  home (Tarih / Başlangıç / Bitiş, duration preview, past-midnight handled). Entries are approved
  at once and tagged "Elle girildi" everywhere (Geçmiş, Onay, home).
- Migration `20261026000003_shifts_manual_entries.sql` applied to the Frankfurt project; its rules
  were checked against the live DB (manual → approved+manual, overlap / future / >31 days / no-end
  refused, `clock_in` 42501, shifts writable only by own-branch yönetici, readable per branch).
- Patron home: "Bugün" stat is now "saat girdi / programda".
- Speed: `getClaims` instead of `getUser`, parallel session reads (D-39), DB + functions moved to
  Frankfurt (D-40). Measured on prod after the move: authenticated pages 0.25–0.45 s.
- `tests/e2e/clock.spec.ts` replaced by `manual-entry.spec.ts` (still not runnable here — no Docker).
