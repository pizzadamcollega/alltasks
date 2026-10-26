# Architecture — Pizzadam Şube ERP

## 1. Stack

Install the **current stable** version of each at project start (`@latest`); don't pin to versions
from memory.

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router, Server Components, Server Actions), TypeScript `strict` |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives), `lucide-react` icons |
| Theme | `next-themes` (`attribute="class"`, values `light` / `dark` / `system`) |
| Forms / validation | `react-hook-form` + `zod` (shared schemas client & server) |
| Database / auth | Supabase (Postgres, Auth, Realtime, pg_cron), region **Frankfurt** |
| Supabase client | `@supabase/supabase-js` + `@supabase/ssr` (cookie sessions) |
| Dates | `date-fns` + `@date-fns/tz` (`TZDate`) with locale `tr` |
| Toasts | `sonner` |
| Excel | `exceljs` (server only) |
| PDF | `@react-pdf/renderer` (server only, in a route handler) |
| Charts | small hand-made SVG/CSS bar chart (no chart library needed) |
| Unit tests | Vitest |
| E2E tests | Playwright + `@axe-core/playwright` |
| Hosting | Vercel (Pro for production, see DECISIONS D-11) |
| Scripts | `tsx` |

## 2. Folder layout

```
app/
  layout.tsx                    # <html lang="tr">, fonts, ThemeProvider, Toaster
  page.tsx                      # redirect to last branch (cookie `pz_branch`) else neutral landing
                                #   "Şubenin giriş adresini kullan" (PWA start_url is "/")
  manifest.ts                   # PWA manifest
  robots.ts                     # disallow all
  [branch]/
    giris/page.tsx              # login (public)
    giris/actions.ts            # signIn server action
    (app)/                      # everything below requires session + membership
      layout.tsx                # loads SessionContext; header; role-based bottom nav
      page.tsx                  # role switch → <EmployeeHome/> | <ManagerHome/>
      takvim/page.tsx           # team schedule (employee) — managers redirected to /program
      talepler/page.tsx         # employee: own requests; manager: inbox (leave, swaps)
      gecmis/page.tsx           # employee history & earnings
      profil/page.tsx           # password, theme, branch switch, sign out
      bildirimler/page.tsx      # notifications list
      onay/page.tsx             # manager: end-of-day approval   (?gun=YYYY-MM-DD)
      program/page.tsx          # manager: weeks                 (?hafta=YYYY-MM-DD)
      calisanlar/page.tsx       # manager: employee list
      calisanlar/[id]/page.tsx  # manager: employee profile
      calisanlar/yeni/page.tsx  # manager: create employee
      raporlar/page.tsx         # manager: monthly report        (?ay=YYYY-MM&sube=…)
      ayarlar/page.tsx          # manager: branch settings
  api/
    export/route.ts             # GET ?branch=&month=&format=xlsx|pdf  (manager only)
middleware.ts                   # @supabase/ssr session refresh; redirect to /<branch>/giris if signed out
lib/
  supabase/client.ts            # browser client (anon/publishable key)
  supabase/server.ts            # server client bound to request cookies
  supabase/admin.ts             # service-role client — import ONLY from server actions in features/accounts
  session.ts                    # getSessionContext(branchSlug) → { user, profile, branch, branches, isManager, isAdmin }
  time.ts                       # TZ helpers: toLocal, businessDay(start, cutoff), roundMinutes, weekStart, formatters
  money.ts                      # formatEUR, sum helpers
  errors.ts                     # map Postgres errors → toast text
  validation/                   # zod schemas per feature
features/
  clock/        actions.ts  components/ClockCard.tsx
  entries/      actions.ts  queries.ts  components/ (EntryList, EntryEditSheet, DayApproval)
  schedule/     actions.ts  queries.ts  components/ (WeekPicker, DayToggleRow, DraftBoard, SwapSheet)
  leave/        actions.ts  queries.ts  components/
  payments/     actions.ts  queries.ts  components/
  accounts/     actions.ts  components/ (NewEmployeeForm, ResetPassword, Deactivate)
  reports/      queries.ts  components/ (DailyBars, PersonTable)  export/xlsx.ts  export/pdf.tsx
  notifications/ components/ (Bell — Realtime), actions.ts
components/
  ui/           # shadcn generated
  app/          # AppHeader, BottomNav, AlertStrip, StatCard, StatusChip, EmptyState, ThemeToggle, Segmented
types/database.ts               # generated — never edit by hand
supabase/                       # migrations, seed.sql, tests (already written)
scripts/                        # create-user.ts, seed-test-users.ts, backup notes
tests/unit/  tests/e2e/
```

## 3. Request flow & data access

- **Reads**: Server Components call `createServerClient()` (user session → RLS applies) and query
  tables/views. Typical reads:
  - employee home: `time_entries` (open + today), `monthly_earnings` (this month),
    `entry_earnings` (this week), `schedule_assignments` for the locked current week,
    `schedule_weeks` (collecting week + deadline), `rpc('template_days')`.
  - manager home: `daily_branch_cost` (yesterday/today), counts of pending/open entries,
    pending `leave_requests`, unseen `schedule_swaps`, `schedule_weeks` statuses, min-staff vs
    assignments for the next 7 days, `monthly_earnings` sums.
- **Writes**: Server Actions (`'use server'`) → zod-validate → Supabase call → `revalidatePath`.
  Prefer RPCs where one exists. Never trust ids from the form for ownership — RLS checks it anyway.
- **Realtime**: only the notifications bell (client component subscribes to
  `postgres_changes` on `notifications` filtered by `user_id=eq.<me>`), and optionally the clock
  card (refresh when own entry changes).
- **Caching**: pages are dynamic (`export const dynamic = 'force-dynamic'` in `(app)/layout.tsx`);
  no cross-user caching anywhere.

### RPCs (already in the migration)

| RPC | Caller | Purpose |
| --- | --- | --- |
| `clock_in(p_branch uuid)` | employee | start shift (server time) |
| `clock_out()` | employee | end open shift |
| `approve_entries(p_ids uuid[])` | manager | bulk approve pending entries |
| `template_days(p_week uuid, p_user uuid = me)` | employee/manager | template dates for a week |
| `close_week_now(p_week uuid)` | manager | close requests early, build draft |
| `publish_week(p_week uuid)` | manager | lock week + notify everyone |
| `request_swap(p_week, p_date, p_to, p_swap_date?)` | employee | offer a day (optionally swap) |
| `respond_swap(p_swap uuid, p_accept bool)` | colleague | accept / decline |
| `cancel_swap(p_swap uuid)` | requester | cancel pending |
| `revert_swap(p_swap uuid)` | manager | undo accepted swap |
| `mark_notifications_read(p_ids uuid[]?)` | anyone | mark read (null = all) |
| `is_branch_manager(uuid)`, `manages_user(uuid)`, `my_role()` | server actions | permission checks before admin API calls |

Plain table writes under RLS: entry edits (`time_entries` update/insert/delete by manager), schedule
requests (`schedule_requests` upsert on `(week_id,user_id)`), assignments (manager insert/delete),
leave requests, payments, wage rates, min staff rules, branch settings, profile theme.

### Views

| View | Columns (main) |
| --- | --- |
| `entry_earnings` | every entry + `hourly_rate`, `amount` |
| `monthly_earnings` | user, branch, month, approved/pending minutes & amounts, approved_days |
| `daily_branch_cost` | branch, work_date, people, minutes, approved/pending amount, open/pending counts |

All are `security_invoker` → callers only see rows RLS allows.

## 4. Auth

- Supabase Auth, email+password provider; **"Confirm email" disabled**; public sign-ups
  **disabled** (Dashboard → Authentication → Providers/Settings).
- Synthetic e-mail: `${username}@${STAFF_EMAIL_DOMAIN}` (default `staff.pizzadam.invalid`).
  Phase 1 must verify Supabase accepts this domain; if not, use a subdomain you control
  (e.g. `staff.qratix.nl`) — no mail is ever sent.
- Login server action: lowercase + trim username → `signInWithPassword` → load profile & check
  membership of `[branch]` (admin passes) → else `signOut` + error.
- `middleware.ts`: refresh session on every request; for `/<branch>/(app)` paths without a session
  redirect to `/<branch>/giris?next=…`.
- `getSessionContext(branchSlug)` (cached per request with React `cache`) returns the profile,
  current branch, all branches of the user, `isManager`, `isAdmin`. `(app)/layout.tsx` calls it and
  `notFound()`s unknown slugs.
- Manager-only routes call `requireManager(ctx)` → redirect to `/<branch>` otherwise.
- Account admin (server actions in `features/accounts/actions.ts`):
  1. check with the **user's** client: `rpc('is_branch_manager', {p_branch})` for every target
     branch / `rpc('manages_user', {p_user})`;
  2. then use `lib/supabase/admin.ts` (service role) for `auth.admin.createUser`,
     `updateUserById({ password })`, `updateUserById({ ban_duration: '876000h' | 'none' })`;
  3. write `profiles`, `branch_members`, `wage_rates` with the service client in the same action;
     on failure delete the created auth user.

## 5. Time & money helpers (`lib/time.ts`, `lib/money.ts`)

Mirror the SQL exactly (unit-tested against the same examples as `supabase/tests/smoke.sql`):

```ts
export const TZ = 'Europe/Amsterdam';
export function roundMinutes(start: Date, end: Date): number   // Math.round(sec / 300) * 5
export function businessDay(start: Date, cutoff = '06:00'): string // 'YYYY-MM-DD'
export function weekStart(date: string): string                 // Monday, ISO
export function requestDeadline(weekStart: string, weekday: number, time: string): Date
export function formatDuration(min: number): string            // "8 sa 35 dk"
export function formatEUR(n: number | string): string           // "€812,50"
export function formatDayTR(d: string): string                  // "Cumartesi 24 Ekim"
```

## 6. Environment variables

| Name | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | service role / secret key — Vercel env, never `NEXT_PUBLIC_` |
| `STAFF_EMAIL_DOMAIN` | server | default `staff.pizzadam.invalid` |
| `APP_BASE_URL` | server | e.g. `https://pizzadam.vercel.app` (login links in Ayarlar) |
| `SUPABASE_DB_URL` | CI only | for backups and DB tests |

## 7. Security checklist

- RLS enabled on every table (migration does it). No table is readable by `anon`.
- Service-role key only in `lib/supabase/admin.ts`; add an ESLint `no-restricted-imports` rule so
  only `features/accounts/**` and `scripts/**` may import it.
- Security headers in `next.config`: `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`, a strict CSP (self + Supabase URL for connect/wss).
- Rate-limit login attempts per IP+username (simple in-memory/Upstash optional) — Supabase Auth also
  rate-limits.
- Never log wages, payments or passwords.

## 8. PWA

`app/manifest.ts`: name "Pizzadam Personel", short_name "Pizzadam", `display: "standalone"`,
`start_url: "/"`, theme/background colours from DESIGN tokens, icons 192/512 + maskable. No
offline mode in v1. Test "Ana ekrana ekle" on iOS Safari and Android Chrome in phase 11; if Android
does not offer installation, add a minimal pass-through service worker.

## 9. Operations

- **Supabase projects**: `pizzadam-prod` (Frankfurt). Local dev with `supabase start` (Docker).
- **Migrations**: `supabase db push` to prod from the main branch only.
- **Cron**: migration `…_cron.sql` schedules `run_schedule_jobs()` every 10 min.
- **Backups**: GitHub Action nightly: `pg_dump "$SUPABASE_DB_URL" -Fc` → encrypted artifact
  (or upload to private storage), keep 30 days. Test a restore once.
- **Free-tier note**: Supabase pauses free projects after 7 days of low activity; daily use keeps it
  active, but use Pro if the business depends on it.
- **Monitoring**: Vercel runtime logs + Supabase logs; add a `/api/health` route that runs
  `select 1` for an uptime check.
