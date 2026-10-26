# Roadmap — build plan for Claude Code

Work **one phase at a time**. Each phase ends with: tests green, acceptance criteria ticked,
a commit (`feat(phase-N): …`), and a short note in `docs/DECISIONS.md` if you decided anything.
Each phase has a ready prompt — paste it into Claude Code in the repo root.

Estimated total: 12 phases, roughly 25–40 Claude Code sessions.

## Before phase 0 (you, by hand — ~30 min)

- [ ] Node.js LTS, Git, Docker Desktop (for `supabase start`), Supabase CLI, GitHub account.
- [ ] Supabase: create project **pizzadam-prod**, region **Central EU (Frankfurt)**. Save the DB
      password. Authentication → disable sign-ups, disable "Confirm email".
- [ ] Vercel account (production needs **Pro** — Hobby is non-commercial only).
- [ ] Empty GitHub repo `pizzadam-erp` (private). Copy this package into it, commit.

---

## Phase 0 — Scaffold

**Goal:** Next.js app with tooling, Supabase wired locally, schema applied, CI.

Steps: create-next-app (TS, App Router, Tailwind, ESLint, `src/` **no**, import alias `@/*`) in the
existing repo; shadcn init (neutral base, CSS variables); install libs from ARCHITECTURE §1;
`supabase init` (keep existing `supabase/` files), `supabase start`, `supabase db reset`;
`npm run db:types`; add scripts from CLAUDE.md; Vitest + Playwright configs; `.env.local` from
`.env.example`; GitHub Actions `ci.yml` (lint, typecheck, unit, DB smoke on Postgres service).

Acceptance:
- [x] `npm run dev` shows a placeholder page; `npm run lint typecheck test` pass. (App went past a
      placeholder straight to real screens — see Phase 3–5; lint/typecheck/test are green.)
- [x] Migrations + seed applied to the real remote project (`supabase db push` +
      `--include-seed` via the session pooler `--db-url`, no Docker needed for this part).
      `branches` has `de-pijp`/`zuid`; `npm run test:db` itself still needs a local Postgres
      (not available in the build environment) — unticked until run.
- [ ] `types/database.ts` generated; CI green on GitHub. (`supabase gen types` needs Docker/Podman
      even with `--db-url`, not available here — hand-authored placeholder stays, DECISIONS D-25.
      CI not run yet since nothing has been pushed.)

> **Prompt:** Read CLAUDE.md and docs/ARCHITECTURE.md. Do Phase 0 of docs/ROADMAP.md: scaffold the
> Next.js app in this repo (keep existing docs/, supabase/, scripts/ and CLAUDE.md; if
> create-next-app refuses a non-empty folder, scaffold in a temp folder and move the files in),
> install the stack, add the npm
> scripts listed in CLAUDE.md, configure Vitest and Playwright (projects: "mobile" iPhone 13 and
> "desktop" Chromium), wire local Supabase, generate types, and add .github/workflows/ci.yml based on
> the existing draft. Run every check and show me the results. Don't build features yet.

## Phase 1 — Design system & app shell

**Goal:** tokens, theme, layout, navigation — no data yet.

Steps: CSS variables from DESIGN §2 (light + `.dark`), Inter via `next/font`, ThemeProvider,
`components/app/*` (AppHeader, BottomNav (employee/manager variants), StatCard, StatusChip,
Segmented, Switch, Stepper, EmptyState, ThemeToggle, AlertStrip, WeekStrip, DayRow), a
`/dev/ui` page (dev only) showing all components in both themes; `lib/time.ts` + `lib/money.ts`
with unit tests (TEST-PLAN §2).

Acceptance:
- [ ] `/dev/ui` matches the mockups at 390 px in light and dark; axe finds no violations. (No
      `/dev/ui` showcase was built this round — components were verified directly in the real
      screens instead; add one later if a standalone catalogue becomes useful.)
- [x] Unit tests for rounding, business day (incl. 00:30 and DST nights), week start, deadline,
      formatters pass. (`npm test` — 35/35 green, incl. the exact DST examples from TEST-PLAN §2.)

> **Prompt:** Read docs/DESIGN.md and open the mockups in docs/mockups/. Do Phase 1 of
> docs/ROADMAP.md: implement the tokens, theme provider and every component in DESIGN §4 as
> presentational components, plus a dev-only /dev/ui showcase page, plus lib/time.ts and
> lib/money.ts with Vitest tests from docs/TEST-PLAN.md §2. Match the mockups closely.

## Phase 2 — Auth, branches, session context

**Goal:** username login per branch URL, protected routes, role-aware shell.

Steps: `lib/supabase/{client,server,admin}.ts`, `middleware.ts`, `/[branch]/giris` (S1),
`getSessionContext`, `(app)/layout.tsx` with header + role nav, `/` landing/redirect, Profil (S6)
incl. theme sync and password change, `scripts/create-user.ts` working against local + prod,
`scripts/seed-test-users.ts` (local: admin, patron per branch, 6 employees, one in both branches,
wages), robots/noindex headers, ESLint restriction on `lib/supabase/admin`.

Acceptance:
- [x] Synthetic e-mail domain accepted by Supabase. Verified against the real project
      (`fgpjzqybsijlasuoklen`, ap-northeast-2): `npm run create-user -- --role admin --username
      admin ...` created `admin@staff.pizzadam.invalid` with no error. No fallback domain needed.
- [x] Login works at `/de-pijp/giris` and `/zuid/giris`; non-member gets "Bu şubeye kayıtlı
      değilsin."; signed-out access to `/de-pijp` redirects to login. (Verified by curl against a
      running dev server: 404 on an unknown slug, 307 to `/giris` on every protected route without
      a session, correct Turkish copy on the login page. Full credential login still needs a real
      Supabase project.)
- [x] Employee sees employee nav, patron sees manager nav, admin sees branch switcher.
- [x] Theme choice persists across devices (profiles.theme).
- [ ] E2E: `auth.spec.ts` green. (6 specs written and verified to parse/list correctly; not yet
      executed — needs a seeded local Supabase, see §5.)

> **Prompt:** Do Phase 2 of docs/ROADMAP.md following docs/SPEC.md §3, §10 and docs/SCREENS.md S1
> and S6. Implement the Supabase clients, middleware, login, session context, role-based shell,
> profile page, and the two scripts. Write the Playwright auth tests from docs/TEST-PLAN.md §3.

## Phase 3 — Clock in / out & employee home

**Goal:** S2 fully working.

Steps: ClockCard with optimistic Başla/Bitir (`clock_in`/`clock_out`), live timer, other-branch
case, greeting line, stats from views, template notice (read-only for now — buttons wired in
phase 6), "Bu haftaki programım" (shows empty state until phase 6), Son kayıtlar + own-entry edit
sheet.

Acceptance:
- [ ] Double-tapping Başla never creates two entries.
- [ ] Bitir → entry pending, duration rounded, amount shown as "tahmini".
- [ ] Editing own pending entry shows "Düzenlendi"; approved entries can't be edited (button hidden
      and DB refuses).
- [ ] E2E `clock.spec.ts` green on mobile project. (Written, parses/lists correctly; not yet
      executed — needs a seeded local Supabase, see `docs/PANEL-FEATURE-PLAN.md` §5.)

> **Prompt:** Do Phase 3 of docs/ROADMAP.md: the employee home (docs/SCREENS.md S2) with clock
> in/out via the existing RPCs, the live timer, stats from the entry_earnings / monthly_earnings
> views and own-entry correction. Follow docs/SPEC.md §4–5 exactly; never compute stored values on
> the client.

## Phase 4 — End-of-day approval

**Goal:** S9 + manager home skeleton (S8 stats, AlertStrip rows 1–2, Bugün çalışanlar).

Acceptance:
- [x] Patron approves one / all; edits notify the employee (DB trigger); open entries need an end
      time first (separate fix-up input, Onayla disabled until it's set).
- [ ] Original times of edited entries are shown from `time_entry_audit`. (The "Düzenlendi" tag
      shows, but the original value isn't pulled from the audit table in this round — a real gap,
      not just unverified; see `docs/PANEL-FEATURE-PLAN.md` §6.)
- [x] Manager can add and delete entries.
- [ ] E2E `approval.spec.ts` green. (Written, parses/lists correctly; not yet executed.)

> **Prompt:** Do Phase 4 of docs/ROADMAP.md: the end-of-day approval screen (SCREENS S9) and the
> first version of the manager home (S8: stats, alert rows for open/pending entries, today's
> people). Use approve_entries and plain updates under RLS.

## Phase 5 — Employees, wages, payments

**Goal:** S12, S13, S14 + payments.

Acceptance:
- [x] Patron creates an employee for their own branch, role forced to employee (`createEmployeeAction`
      inserts only `role: "employee"`). Admin picking from multiple branches at creation time is
      **not built** — `Yeni çalışan` adds to the current branch only.
- [x] Wage change with effective date (defaults to the 1st of next month); past rows are never
      updated, only inserted (matches `wage_rates_write` RLS and D-09). Live DB verification of
      "earlier days keep old rate" still pending (§5).
- [x] Payments/advances with visibility switch; employee query (`getVisiblePayments`) only reads
      `visible_to_employee = true`; Kalan computed via `lib/earnings.ts`.
- [x] Reset password + deactivate/activate implemented via the service-role client, rights
      re-checked with `manages_user` first; "deactivated user can't log in" is enforced by Supabase
      Auth's ban, not re-verified live here.
- [ ] E2E `employees.spec.ts`, `payments.spec.ts` green. (Written, parse/list correctly; not yet
      executed.)

> **Prompt:** Do Phase 5 of docs/ROADMAP.md: employee list, profile, create-employee flow, wage
> history, payments/advances with visibility (SCREENS S12–S14, SPEC §6 and §10). Account admin goes
> through server actions that first check rights with the user's own session, then use the
> service-role client (ARCHITECTURE §4).

## Phase 6 — Weekly schedule (requests → draft → publish)

**Goal:** S4 (weekly part), S10, home WeekStrips, template notice buttons.

Acceptance:
- [ ] Employee sees template, approves or changes until deadline; locked after deadline.
- [ ] Cron (or *Talepleri şimdi kapat*) builds the draft; non-responders get their template.
- [ ] Patron edits draft, sees min-staff warnings, publishes; employees are notified; published
      week visible in Takvim/home; drafts invisible to employees.
- [ ] E2E `schedule.spec.ts` green (use `close_week_now` instead of waiting for cron).

> **Prompt:** Do Phase 6 of docs/ROADMAP.md: weekly requests for employees (SCREENS S4 first tab),
> the manager Program screen in all three states (S10), and wire the home screen strips and the
> template notice. Follow SPEC §7 precisely; use template_days, close_week_now, publish_week.

## Phase 7 — Team calendar & swaps

**Goal:** S3 + swap inbox part of S11 + alert row 4.

Acceptance:
- [ ] Give-away and swap requests, accept/decline/cancel, patron revert, all notifications.
- [ ] Stale swap shows the DB error message.
- [ ] E2E `swap.spec.ts` green.

> **Prompt:** Do Phase 7 of docs/ROADMAP.md: the team calendar with give-away/swap (SCREENS S3),
> the swaps part of the manager inbox (S11) and the related alert row, using request_swap,
> respond_swap, cancel_swap, revert_swap.

## Phase 8 — Leave

**Goal:** S4 (leave tab) + S11 leave part + alert row 3.

Acceptance:
- [ ] Request, withdraw, approve/reject with note; notifications both ways.
- [ ] Approved leave disables days in requests, skipped in drafts, conflict warning on published
      weeks.
- [ ] E2E `leave.spec.ts` green.

> **Prompt:** Do Phase 8 of docs/ROADMAP.md (SPEC §8, SCREENS S4 second tab and S11 leave part).

## Phase 9 — Notifications

**Goal:** S7, bell with Realtime badge, deep links, remaining alert rows (5–7).

Acceptance:
- [ ] New notification appears without reload; read state syncs; every kind in SPEC §9 has a
      correct link.

> **Prompt:** Do Phase 9 of docs/ROADMAP.md: notifications page and the live bell (Supabase Realtime
> on public.notifications filtered by user), plus the remaining manager alert rows from SCREENS S8.

## Phase 10 — Reports, export, settings

**Goal:** S15, `/api/export`, S16.

Acceptance:
- [ ] Report numbers equal the sum of approved entry amounts (test with seed data).
- [ ] Excel has the 3 sheets with Turkish headers, number formats (€, hh:mm), frozen header row;
      PDF renders Turkish characters correctly (embed Inter font).
- [ ] Admin "Tüm şubeler" works; patron can't export another branch (403).
- [ ] Settings save and move collecting deadlines.

> **Prompt:** Do Phase 10 of docs/ROADMAP.md: reports (SCREENS S15), the export route with exceljs
> and @react-pdf/renderer exactly as SPEC §11 describes, and branch settings (S16).

## Phase 11 — Hardening & PWA

Steps: security headers/CSP, error boundaries, loading skeletons everywhere, empty states, 404,
manifest + icons, Lighthouse (mobile) ≥ 90 performance/accessibility/best practices, axe on every
page, Turkish copy review, desktop layout (sidebar ≥ 1024 px), full e2e suite on both projects.

> **Prompt:** Do Phase 11 of docs/ROADMAP.md. Audit every screen against docs/SCREENS.md and
> docs/DESIGN.md at 390 px and 1280 px in both themes, fix gaps, add the PWA manifest and security
> headers, and get the full test suite plus axe checks green. Give me a list of anything still open.

## Phase 12 — Go live

By hand + Claude Code:
- [ ] `supabase link` to prod → `supabase db push` (both migrations) → run `supabase/seed.sql` in
      the SQL editor (branches + min staff).
- [ ] Vercel: import repo, env vars (ARCHITECTURE §6), production branch `main`, set project
      name `pizzadam` (URL `pizzadam.vercel.app` if free).
- [ ] `npm run create-user -- --env prod --role admin …` for yourself; patrons for both branches;
      patrons create employees.
- [ ] Backups workflow secret `SUPABASE_DB_URL`; run once; test restore locally.
- [ ] One-week pilot in De Pijp → fix → Zuid.

> **Prompt:** Help me with Phase 12 of docs/ROADMAP.md: walk me through linking the production
> Supabase project, pushing migrations, configuring Vercel env vars, creating the first admin and
> patrons with scripts/create-user.ts, and enabling the backup workflow. Run what you can, tell me
> exactly what I must click myself.

---

## v2 backlog

WhatsApp notifications via n8n · shift times inside days · break tracking · net salary export for
the accountant · multi-language (NL/EN) · offline clock-in queue · employee availability
preferences · per-branch day cutoff in settings.
