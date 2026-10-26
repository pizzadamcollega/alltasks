# Decision log

Newest at the bottom. Format: **ID · date · decision** — why. Add a line whenever a phase decides
something the spec didn't.

| ID | Date | Decision | Why |
| --- | --- | --- | --- |
| D-01 | 2026-10-25 | Three roles: **admin** (all branches), **patron** (one branch), **employee**. Admin and patron have the same rights inside a branch. | Owner's request. |
| D-02 | 2026-10-25 | Login with **username + password**; Supabase account uses `<username>@staff.pizzadam.invalid`. | Staff have no e-mail; `.invalid` is a reserved TLD so nothing can ever be delivered. |
| D-03 | 2026-10-25 | Path-based branch URLs `/de-pijp`, `/zuid` on one deployment. | Wildcard sub-domains are not possible on a free `*.vercel.app` name; one codebase. |
| D-04 | 2026-10-25 | Schedule unit = **whole day**, week Mon–Sun. | Owner's request; shift times are v2. |
| D-05 | 2026-10-25 | Durations rounded to the **nearest 5 minutes**, per entry. | Owner's request; per-entry keeps day totals explainable. |
| D-06 | 2026-10-25 | Business-day cutoff **06:00** (start before 06:00 counts for the previous day). | Shops close 03:00; covers starts after midnight. |
| D-07 | 2026-10-25 | **No pause button, no break deduction.** Patrons/admins don't clock in; a working patron gets a separate employee account. | Owner removed "Durdur"; keeps roles simple. |
| D-08 | 2026-10-25 | Employees correct their own entries **until approval**; flagged "Düzenlendi" with full audit. Patron approves each day. | Owner's request + traceability. |
| D-09 | 2026-10-25 | Wage is **per person** (same in both branches) with an effective-from history. | Owner: "ücret farkı yok"; history keeps past months stable. |
| D-10 | 2026-10-25 | Payments/advances are recorded **per branch** with a per-record "visible to employee" switch (default hidden). | Each branch pays its own share; owner wants control over what staff see. |
| D-11 | 2026-10-25 | Hosting: Vercel + Supabase (Frankfurt). **Production on Vercel Pro**; Hobby is limited to non-commercial personal use. Nightly `pg_dump` backup. | Vercel fair-use terms; payroll data needs backups. |
| D-12 | 2026-10-25 | Request deadline default **Thursday 23:59** of the previous week; editable per branch. | Gives the patron Fri–Sun to finalise. |
| D-13 | 2026-10-25 | Non-responders get their **template automatically** at the deadline. | Owner's request. |
| D-14 | 2026-10-25 | After publish, employees **give away / swap** days with the colleague's acceptance; patron is notified and can revert. | Owner: "kendi aralarında değişiklik olabilir, bildirim patrona düşsün". Acceptance prevents assigning someone without consent. |
| D-15 | 2026-10-25 | Approved leave does **not** auto-change a published week; patrons are warned. | Avoids silent schedule changes. |
| D-16 | 2026-10-25 | Minimum staff is a **warning**, never blocks publishing. Default Mon–Thu 4, Fri–Sat 6, Sun 4. | Owner: "uyarı olarak göstersin". |
| D-17 | 2026-10-25 | Earnings are **gross** (rate × hours); no tax. | Not a payroll system. |
| D-18 | 2026-10-25 | Elapsed time is **real time** on DST nights (one hour more in October, less in March). | Correct pay for hours actually worked. |
| D-19 | 2026-10-25 | Notifications in-app (Realtime) in v1; WhatsApp in v2 via n8n reading `notifications`. | Owner: plan later. |
| D-20 | 2026-10-25 | All permission rules enforced in Postgres (RLS, triggers, SECURITY DEFINER RPCs); UI only reflects them. | One place to audit; safe against crafted API calls. |
| D-21 | 2026-10-25 | Turkish-only UI; code, docs and commits in English. | Staff language; better tooling support. |
| D-22 | 2026-10-25 | Theme per user: Aydınlık / Karanlık / Cihaz, stored in `profiles.theme`. | Owner's request; follows the user across devices. |
| D-23 | 2026-10-26 | `--accent` sampled from the pizza-slice logo (`pizza.svg`, `#BE1E2D`), replacing the placeholder tomato red. Dark-mode tint is a lightened derivative, free to retune for contrast. | Owner supplied the logo and said usability/readability outrank matching it exactly. |
| D-24 | 2026-10-26 | First build pass covers ROADMAP Phase 0–5 only (scaffold, auth, employee home/Geçmiş, manager Onay, Çalışanlar/ücret/ödeme). Program, swaps, leave, notifications, reports/export, Ayarlar and PWA hardening (Phase 6–11) are explicitly deferred to a later round — `components/app/app-nav.tsx` only links routes that exist. | Owner asked for a focused ücret/mesai panel first; cutting here is a coherent slice that doesn't touch schedule-dependent code. |
| D-25 | 2026-10-26 | `types/database.ts` is hand-authored (covering only the tables/views/functions Phase 0–5 touches) because no live Supabase project exists yet to run `supabase gen types` against. | Must be regenerated and replaced wholesale once a real project exists — do not keep hand-editing it afterwards. |
| D-26 | 2026-10-26 | The Next.js request-interception file is `proxy.ts` (`export async function proxy`), not `middleware.ts`. | Next.js 16 deprecated the `middleware` convention in favour of `proxy`; `next build` warns and offers a codemod. |
| D-27 | 2026-10-26 | Next.js Cache Components / PPR (`cacheComponents`, `partialPrefetching`) are left **off** in `next.config.ts`. | Every page renders per-user RLS-scoped data (wages, hours, payments); no page may ever be cached across users, so there is nothing here that benefits from opting in, and opting in by default is a cross-user-leak footgun to avoid. |
| D-28 | 2026-10-27 | Staff synthetic e-mail domain (`staff.pizzadam.invalid`, D-02) is **confirmed working** against the real Supabase project (`fgpjzqybsijlasuoklen`) — `admin@staff.pizzadam.invalid` created with no error. No fallback domain needed. | Resolves the open risk noted in ARCHITECTURE/ROADMAP Phase 2. |
| D-29 | 2026-10-27 | `SUPABASE_DB_URL` must use the **session pooler** host (`aws-0-ap-northeast-2.pooler.supabase.com`, user `postgres.<project-ref>`), not the direct `db.<project-ref>.supabase.co` host — the direct host doesn't resolve from this network (likely IPv6-only now on new projects). | `supabase db push --db-url` only succeeded once switched to the pooler URI from Dashboard → Connect → Session pooler. The same pooler-style URL should be used for `SUPABASE_DB_URL` in CI (`backup.yml`) once that secret is set. |
| D-30 | 2026-10-27 | `supabase gen types typescript`, even with `--db-url` against a remote project, still shells out to a local Docker/Podman container (`postgres-meta`) to introspect — it is **not** a pure network call. | No Docker in the build environment, so `types/database.ts` stays the D-25 hand-authored placeholder; run `npm run db:types` from a machine with Docker Desktop to regenerate for real. |
| D-31 | 2026-10-27 | Repo pushed to `https://github.com/pizzadamcollega/alltasks.git` (`main`); deployed to Vercel at `https://alltasks-mauve.vercel.app`. | First real deployment; see `docs/PANEL-FEATURE-PLAN.md` §0 for the live-infra table. |
| D-32 | 2026-10-27 | Vercel's login bug (missing `STAFF_EMAIL_DOMAIN`/`APP_BASE_URL`, D-31) is **fixed** — added via `vercel link --project alltasks` + `vercel env add ... production` + `vercel --prod` redeploy. End-to-end login verified against production (`tests/manual/prod-login-check.mjs`): admin → `/de-pijp` patron home, real Supabase data, 0 console errors. | Closes the last open item from the Vercel deploy; the panel is genuinely live now, not just deployed. |
