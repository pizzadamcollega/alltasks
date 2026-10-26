# Test plan — Pizzadam Şube ERP

Four layers. CI runs 1–2 on every push, 3–4 on pull requests to `main`.

## 1. Database (already written)

`supabase/tests/smoke.sql` — one transaction, rolled back. Covers:

| # | Area | Checks |
| --- | --- | --- |
| 1 | Clock in/out | open entry; second clock-in refused; Bitir → pending; rounding 3h02 → 180; audit rows |
| 2 | Employee privacy | own entries/wage only; colleagues' names visible; one branch visible; earning = 3h × 13 |
| 3 | Corrections | edit flags "Düzenlendi" + audit; employee can't approve or rename self; theme allowed |
| 4 | Manager | approve sets approved_by; manager edit flag; manual entry 01:30 → previous day; 1h17 → 75; patron can't add another patron |
| 5 | Locking | employee notified of manager edit; approved entry locked for employee |
| 6 | Branch isolation | other patron sees no entries; sees wages of shared employees only |
| 7 | Admin | sees all branches, entries, wages |
| 8 | Wage history | old rate for days before effective date; 75 min × 12.50 = 15.63 |
| 9 | Payments | hidden → invisible; visible → visible + notification |
| 10 | Schedule | template from last published week; change request; deadline → draft; auto template; draft hidden from employee; requests closed after deadline; publish |
| 11 | Swap | request, notify, accept moves day, manager notified, revert |
| 12 | Leave | forced pending; manager decision; notifications |
| 13 | Anon | no access |

Run: `npm run test:db` (local Supabase) or `supabase/tests/run-local.sh` (plain Postgres + stub).
**Rule:** every new migration that changes a rule adds or updates a numbered block here.

Add later (Phase 6–8 if behaviour is extended): swap with `swap_date`, leave conflict notification
on a published week, deadline move on branch settings update, deactivated employee excluded from
drafts.

## 2. Unit (Vitest) — `tests/unit`

| File | Cases |
| --- | --- |
| `time.test.ts` | `roundMinutes`: 7 min → 5, 8 → 10, 7m30s → 10, 3h02 → 180, 2h32m30s → 155 · `businessDay`: 17:00 → same day, 00:30 → previous day, 05:59 → previous, 06:00 → same · DST: 2026-10-24 17:00 → 2026-10-25 03:00 = 660 min; 2027-03-27 17:00 → 2027-03-28 03:00 = 540 min · `weekStart('2026-10-25')` = `2026-10-19` · `requestDeadline('2026-11-02', 4, '23:59')` = 2026-10-29 23:59 Amsterdam · `formatDuration(515)` = "8 sa 35 dk", `formatDuration(40)` = "40 dk" · `formatDayTR('2026-10-24')` = "Cumartesi 24 Ekim" |
| `money.test.ts` | `formatEUR(812.5)` = "€812,50", `formatEUR(6510.4)` = "€6.510,40", amount 515 min × 13 = 111.58 |
| `validation.test.ts` | username slug from "Şevval Öztürk" → `sevval.ozturk`; invalid usernames rejected; entry edit: end > start, ≤ 16 h, not in future |
| `alerts.test.ts` | manager alert builder: order, hidden when zero, texts |

## 3. End-to-end (Playwright) — `tests/e2e`

Setup: `supabase start && npm run db:reset && npm run db:seed-users`; base URL `http://localhost:3000`.
Projects: **mobile** (iPhone 13) for employee specs, **desktop** (Chromium) for manager specs.
Seed users (password `Test1234!`): `admin`, `patron.pijp`, `patron.zuid`, `ahmet` (pijp),
`elif` (pijp + zuid), `murat`, `can`, `sena`, `deniz` (pijp), `zeynep` (zuid).
Use `page.clock` / DB helpers to control time where needed; reset DB per spec file.

| Spec | Scenarios |
| --- | --- |
| `auth.spec.ts` | login ok → home; wrong password message; non-member at /zuid → "Bu şubeye kayıtlı değilsin."; signed-out redirect; theme persists after re-login; password change |
| `clock.spec.ts` | Başla → timer runs → Bitir → "Mesai bitti · onay bekliyor"; double-click Başla → one entry; edit own entry → Düzenlendi; approved entry not editable |
| `approval.spec.ts` | patron sees yesterday's entries; open entry needs end; approve one; approve all; edit → employee notification; add entry; delete entry |
| `employees.spec.ts` | create employee → can log in; duplicate username error; wage change effective next month; reset password; deactivate → login blocked |
| `payments.spec.ts` | add hidden advance → employee sees nothing; toggle visible → employee sees block + Kalan |
| `schedule.spec.ts` | employee approves template; another changes days; close requests now; draft shows dashed chips + min-staff warning; patron removes/adds person; publish; employee sees week; draft hidden before publish |
| `swap.spec.ts` | give-away request → colleague accepts → both calendars updated → patron alert → revert |
| `leave.spec.ts` | request tatil → patron approves with note → employee notified → day disabled in next request |
| `reports.spec.ts` | totals equal seeded sums; Excel download has 3 sheets (parse with exceljs); PDF download non-empty; patron can't export other branch (403) |
| `a11y.spec.ts` | axe on every screen in light and dark → 0 serious/critical violations |

## 4. Manual / exploratory (before go-live)

- Real phones: iPhone (Safari, PWA "Ana Ekrana Ekle"), Android (Chrome install), small screen 360 px.
- Night shift across midnight on a real evening; DST night simulation via DB timestamps.
- Two employees swapping at the same time; patron editing while employee edits (last write wins,
  both audited).
- Slow 3G throttling: Başla/Bitir feedback, no duplicates.
- Turkish characters in names (ç ğ ı İ ö ş ü) in UI, Excel and PDF.
- Dark mode contrast on all chips.
