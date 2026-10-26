# CLAUDE.md — Pizzadam Şube ERP

Private, mobile-first web app for two Pizzadam branches (Amsterdam De Pijp, Amsterdam Zuid):
shift clock-in/out, end-of-day approval by the branch boss, per-person hourly wages and
earnings, weekly day-based scheduling with templates, day swaps, leave requests,
payments/advances, monthly reports with Excel/PDF export.

**UI language is Turkish only.** Code, comments, commit messages and docs are English.

## Read first

| File | What it holds |
| --- | --- |
| `docs/SPEC.md` | Functional spec: roles, rules, every flow, edge cases. **Source of truth for behaviour.** |
| `docs/SCREENS.md` | Screen-by-screen spec: route, data, components, states, actions, Turkish copy. |
| `docs/ARCHITECTURE.md` | Stack, folder layout, auth, data-access patterns, RPC list, env vars. |
| `docs/DESIGN.md` | Design tokens (light/dark), components, layout rules. Mockups: see link inside. |
| `docs/ROADMAP.md` | Phased build plan with acceptance criteria. **Work phase by phase.** |
| `docs/TEST-PLAN.md` | DB, unit, e2e and accessibility tests to write and keep green. |
| `docs/DECISIONS.md` | Decision log — why things are the way they are. Append when you decide something. |
| `supabase/migrations/*.sql` | The schema, RLS, triggers and RPCs. Already written and tested. |

## Golden rules

1. **The database is the security boundary.** Every permission rule lives in Postgres RLS,
   triggers and SECURITY DEFINER RPCs (`supabase/migrations`). The UI only hides what the user
   can't do; it never *grants* anything. Never "fix" a permission problem in TypeScript alone.
2. **Never use the service-role key in client code or in a Server Component that renders user
   data.** It is only for `lib/supabase/admin.ts`, used by server actions that manage auth users
   (create user, reset password, ban) **after** checking the caller's rights with their own
   session (`rpc('manages_user')` / `rpc('is_branch_manager')`).
3. **Times:** store `timestamptz`; compute and display in `Europe/Amsterdam`. Business day,
   5-minute rounding and earnings are computed **in SQL** (trigger + views). The client may
   preview them with `lib/time.ts` helpers that mirror the SQL exactly — never persist a
   client-computed value.
4. **Money:** `numeric` in Postgres, strings/`Decimal`-safe handling in TS; format with
   `Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR' })` → `€812,50`.
5. **Schema changes** go in a **new** migration file (`supabase migration new <name>`); never edit
   an applied migration. After any schema change: regenerate types
   (`npm run db:types`) and run `npm run test:db`.
6. **Mobile first.** Design at 390 px wide; touch targets ≥ 44 px; bottom navigation; works in
   light and dark theme. Check every new screen at 390 px and 1280 px.
7. **Accessibility:** real `<button>`, `<a>`, `<label>`; visible focus; colour is never the only
   signal (always a text label like "Bekliyor"); contrast ≥ 4.5:1.
8. Keep components small; server-fetch in Server Components; mutate with Server Actions that call
   Supabase (RPCs or table writes under RLS), then `revalidatePath`. Validate every action input
   with `zod`.
9. Errors from Postgres are already Turkish (`raise exception '…'`). Surface `error.message` in a
   toast for codes `42501`, `23514`, `23505`, `P0002`; log anything else and show
   "Bir hata oluştu, tekrar dene."
10. Before saying a phase is done: `npm run lint && npm run typecheck && npm test && npm run test:db`
    pass, and the phase's acceptance criteria in `docs/ROADMAP.md` are ticked.

## Commands

```bash
npm run dev            # Next.js dev server
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest unit tests
npm run test:e2e       # Playwright (needs `supabase start` + `npm run db:seed-users`)
npm run test:db        # supabase/tests/smoke.sql against the local Supabase DB
npm run db:types       # supabase gen types typescript --local > types/database.ts
npm run db:reset       # supabase db reset (migrations + seed.sql)
npm run db:seed-users  # tsx scripts/seed-test-users.ts (local only)
npm run create-user    # tsx scripts/create-user.ts — create admin/patron/employee in any env
```

## Glossary (use these Turkish UI terms consistently)

| Concept | UI term |
| --- | --- |
| Clock in / out | Başla / Bitir |
| Time entry | Mesai kaydı |
| Pending approval | Onay bekliyor / Bekliyor |
| Approved | Onaylandı |
| Edited by employee | Düzenlendi |
| End-of-day approval | Gün sonu onayı |
| Weekly schedule | Haftalık program |
| Template | Şablon |
| Request deadline | Talep kapanışı |
| Draft / Published (locked) | Taslak / Yayınlandı (Kilitli) |
| Give a day away / swap | Günü devret / Gün değiştir |
| Leave / Holiday | İzin / Tatil |
| Advance / Payment | Avans / Ödeme |
| Minimum staff | Minimum personel |
| Boss (branch manager) | Patron |
| Remaining balance | Kalan |
