// D-45..D-49 DB test that needs no Docker: runs every migration (minus pg_cron)
// on PGlite (in-process Postgres) with Supabase-like stubs for auth.uid() and
// the API roles, then walks the kasacı → yönetici → day-close flow as the real
// roles (RLS on) and prints PASS/FAIL per check.
//
//   npm run test:workflow
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = process.argv[2] ?? process.cwd();
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);

const dir = path.join(root, "supabase/migrations");
for (const file of readdirSync(dir).sort()) {
  if (file.includes("_cron")) continue;
  try {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
    console.log("migrated", file);
  } catch (e) {
    console.log("MIGRATION FAILED", file, e.message);
    process.exit(1);
  }
}
await db.exec(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log(cond ? "PASS" : "FAIL", name, extra);
};

async function as(uid, sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  if (uid) await db.exec("set role authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
async function expectError(name, uid, sql, params = [], match) {
  try {
    await as(uid, sql, params);
    ok(name, false, "(no error)");
  } catch (e) {
    ok(name, !match || e.message.includes(match), `→ ${e.message}`);
  }
}

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const [P, A, K, B, ADMIN] = [id(1), id(2), id(3), id(4), id(5)];
const branch = (await db.query("select id from public.branches where slug = 'de-pijp'")).rows[0].id;
await db.exec(`
  insert into auth.users values ('${P}'), ('${A}'), ('${K}'), ('${B}'), ('${ADMIN}');
  insert into public.profiles (id, full_name, username, role, duties) values
    ('${P}', 'Yönetici Pijp', 'yonetici.pijp', 'patron', '{}'),
    ('${A}', 'Ahmet Usta', 'ahmet', 'employee', '{bezorgd,usta}'),
    ('${K}', 'Murat Kasa', 'murat', 'employee', '{kasaci}'),
    ('${B}', 'Berk Bezorgd', 'berk', 'employee', '{bezorgd}'),
    ('${ADMIN}', 'Furkan', 'furkan', 'admin', '{}');
  insert into public.branch_members (user_id, branch_id) values
    ('${P}', '${branch}'), ('${A}', '${branch}'), ('${K}', '${branch}'), ('${B}', '${branch}');
  insert into public.wage_rates (user_id, hourly_rate, effective_from) values
    ('${A}', 13, '2026-01-01'), ('${K}', 14, '2026-01-01'), ('${B}', 12, '2026-01-01');
`);

// one business day for everything: start 5h ago keeps all entries on it unless that crosses 06:00
const day = (await db.query("select public.compute_work_date(now() - interval '5 hours', $1) as d", [branch])).rows[0].d;
const dayStr = day.toISOString().slice(0, 10);
console.log("business day", dayStr);

// --- duties -------------------------------------------------------------
await expectError("employee cannot give themselves a duty", B, `update public.profiles set duties = '{bezorgd,kasaci}' where id = $1`, [B], "tema");
await expectError("employee keeps at least one duty", P, `update public.profiles set duties = '{}' where id = $1`, [B], "En az bir görev");
const dutyUpd = await as(P, `update public.profiles set duties = '{bezorgd}' where id = $1 returning duties`, [B]);
ok("patron can set an employee's duties", dutyUpd.rows.length === 1);

// --- kasacı of the day -------------------------------------------------
await as(P, `insert into public.shifts (branch_id, user_id, work_date, start_time) values ($1,$2,$5,'16:00'),($1,$3,$5,'16:00'),($1,$4,$5,'16:00')`, [branch, A, K, B, dayStr]);
await expectError("only kasacı-duty people can be the kasacı", P, `select public.set_day_cashier($1, $2, $3)`, [branch, dayStr, A], "kasacı görevi");
await expectError("employee cannot set the kasacı", K, `select public.set_day_cashier($1, $2, $3)`, [branch, dayStr, K], "yetkin yok");
await as(P, `select public.set_day_cashier($1, $2, $3)`, [branch, dayStr, K]);
ok("K is the day's kasacı", (await as(K, `select public.is_day_cashier($1, $2) as v`, [branch, dayStr])).rows[0].v === true);
ok("A is not", (await as(A, `select public.is_day_cashier($1, $2) as v`, [branch, dayStr])).rows[0].v === false);

// --- start / finish ------------------------------------------------------
const startA = await as(A, `insert into public.time_entries (user_id, branch_id, start_at) values ($1, $2, now() - interval '5 hours') returning id, status`, [A, branch]);
ok("start-only entry is open", startA.rows[0].status === "open");
const entryA = startA.rows[0].id;
await expectError("second running entry refused", A, `insert into public.time_entries (user_id, branch_id, start_at) values ($1, $2, now() - interval '1 hour')`, [A, branch]);
const finA = await as(A, `update public.time_entries set end_at = now() - interval '30 minutes' where id = $1 returning status`, [entryA]);
ok("finish moves it to pending (not approved, D-46)", finA.rows[0].status === "pending");
// an employee's status write is ignored (the trigger recomputes it), not an error
await as(A, `update public.time_entries set status = 'approved' where id = $1`, [entryA]);
const selfStatus = (await as(A, `select status, approved_by from public.time_entries where id = $1`, [entryA])).rows[0];
ok("employee cannot self-approve (status stays pending)", selfStatus.status === "pending" && selfStatus.approved_by === null);

const entryB = (await as(B, `insert into public.time_entries (user_id, branch_id, start_at, end_at) values ($1, $2, now() - interval '5 hours', now() - interval '1 hour') returning id, status`, [B, branch])).rows[0];
ok("hand entry with both times goes pending, not approved (was D-37)", entryB.status === "pending");
const entryK = (await as(K, `insert into public.time_entries (user_id, branch_id, start_at, end_at) values ($1, $2, now() - interval '5 hours', now() - interval '1 hour') returning id`, [K, branch])).rows[0].id;

// --- visibility ---------------------------------------------------------
ok("kasacı sees the day's entries", (await as(K, `select count(*)::int as n from public.time_entries where branch_id = $1 and work_date = $2`, [branch, dayStr])).rows[0].n === 3);
ok("non-kasacı sees only own", (await as(B, `select count(*)::int as n from public.time_entries where branch_id = $1`, [branch])).rows[0].n === 1);
const kasaRates = (await as(K, `select count(*)::int as n from public.entry_earnings where user_id <> $1 and hourly_rate is not null`, [K])).rows[0].n;
ok("kasacı never sees colleagues' wages", kasaRates === 0);

// --- review order ------------------------------------------------------
ok("yönetici cannot skip the kasacı", (await as(P, `select public.manager_approve('entry', $1::uuid[]) as n`, [[entryA]])).rows[0].n === 0);
ok("non-kasacı cannot cashier-approve", (await as(B, `select public.cashier_approve('entry', $1::uuid[]) as n`, [[entryA]])).rows[0].n === 0);
ok("kasacı cannot approve own entry", (await as(K, `select public.cashier_approve('entry', $1::uuid[]) as n`, [[entryK]])).rows[0].n === 0);
ok("kasacı approves A", (await as(K, `select public.cashier_approve('entry', $1::uuid[]) as n`, [[entryA]])).rows[0].n === 1);
const afterCash = (await as(P, `select status, cashier_approved_by from public.time_entries where id = $1`, [entryA])).rows[0];
ok("…cashier_approved with the kasacı's name on it", afterCash.status === "cashier_approved" && afterCash.cashier_approved_by === K);
await expectError("employee cannot edit after kasacı approval", A, `update public.time_entries set start_at = start_at + interval '5 minutes' where id = $1`, [entryA], "Onaylanmış");

await expectError("return needs a note", K, `select public.return_item('entry', $1, '  ')`, [entryB.id], "sebebini");
await as(K, `select public.return_item('entry', $1, 'Bitiş saati yanlış')`, [entryB.id]);
const ret = (await as(B, `select status, return_note from public.time_entries where id = $1`, [entryB.id])).rows[0];
ok("kasacı returns B's entry with a note", ret.status === "returned" && ret.return_note === "Bitiş saati yanlış");
const resend = (await as(B, `update public.time_entries set end_at = end_at - interval '15 minutes' where id = $1 returning status`, [entryB.id])).rows[0];
ok("fixing a returned entry resends it (pending)", resend.status === "pending");
await as(K, `select public.cashier_approve('entry', $1::uuid[])`, [[entryB.id]]);

ok("yönetici approves kasacı-approved + kasacı's own (D-47)", (await as(P, `select public.manager_approve('entry', $1::uuid[]) as n`, [[entryA, entryB.id, entryK]])).rows[0].n === 3);
const approved = (await as(P, `select count(*)::int as n from public.time_entries where status = 'approved' and approved_by = $1`, [P])).rows[0].n;
ok("all three approved by the yönetici", approved === 3);
await expectError("manager cannot flip status by plain update", P, `update public.time_entries set status = 'pending' where id = $1`, [entryA], "onay ekranından");

// --- earnings views -----------------------------------------------------
const earn = (await as(A, `select approved_amount, pending_amount from public.monthly_earnings where user_id = $1`, [A])).rows[0];
ok("approved shows in monthly earnings", Number(earn.approved_amount) > 0 && Number(earn.pending_amount) === 0, JSON.stringify(earn));

// --- material ----------------------------------------------------------
await expectError("only an usta sends material", B, `insert into public.material_reports (branch_id, user_id, work_date, dough_s) values ($1,$2,$3,-2)`, [branch, B, dayStr], "usta");
const mat = (await as(A, `insert into public.material_reports (branch_id, user_id, work_date, dough_s, dough_m, note) values ($1,$2,$3,-5,3,'peynir az') returning id, status`, [branch, A, dayStr])).rows[0];
ok("usta report starts pending", mat.status === "pending");
await expectError("usta cannot send for another day", A, `insert into public.material_reports (branch_id, user_id, work_date) values ($1,$2,$3)`, [branch, A, "2020-01-01"], "bugün veya dün");
ok("yönetici cannot skip kasacı on material", (await as(P, `select public.manager_approve('material', $1::uuid[]) as n`, [[mat.id]])).rows[0].n === 0);
ok("kasacı approves material", (await as(K, `select public.cashier_approve('material', $1::uuid[]) as n`, [[mat.id]])).rows[0].n === 1);

// --- cash --------------------------------------------------------------
await expectError("non-kasacı cannot enter cash", B, `insert into public.cash_counts (branch_id, user_id, work_date, online) values ($1,$2,$3,10)`, [branch, B, dayStr]);
const cash = (await as(K, `insert into public.cash_counts (branch_id, user_id, work_date, opening_float, online, kiosk, contant, note) values ($1,$2,$3,150,812.50,100.25,50,'5€ eksik') returning id, total, status`, [branch, K, dayStr])).rows[0];
ok("cash total generated (962.75), pending", Number(cash.total) === 962.75 && cash.status === "pending", JSON.stringify(cash));
ok("kasacı cannot approve cash", (await as(K, `select public.cashier_approve('cash', $1::uuid[]) as n`, [[cash.id]]).then((r) => r.rows[0].n).catch(() => 0)) === 0);
ok("employees cannot read the cash count", (await as(A, `select count(*)::int as n from public.cash_counts`)).rows[0].n === 0);

// --- close / lock / reopen ---------------------------------------------
await expectError("cannot close with open items", P, `select public.close_day($1, $2)`, [branch, dayStr], "Onaylanmamış malzeme");
await as(P, `select public.manager_approve('material', $1::uuid[])`, [[mat.id]]);
await expectError("cannot close before cash approved", P, `select public.close_day($1, $2)`, [branch, dayStr], "Kasa sayımı");
await as(P, `select public.manager_approve('cash', $1::uuid[])`, [[cash.id]]);
await expectError("employee cannot close the day", K, `select public.close_day($1, $2)`, [branch, dayStr], "yetkin yok");
const closed = (await as(P, `select (public.close_day($1, $2)).snapshot as s`, [branch, dayStr])).rows[0].s;
ok("day closes with a snapshot", closed.entries.length === 3 && closed.cash.total === 962.75 && closed.materials.length === 1);
await expectError("closed day: manager edit refused", P, `update public.time_entries set end_at = end_at - interval '5 minutes' where id = $1`, [entryA], "kapatıldı");
await expectError("closed day: delete refused", P, `delete from public.time_entries where id = $1`, [entryA], "kapatıldı");
await expectError("closed day: cash edit refused", P, `update public.cash_counts set online = 1 where id = $1`, [cash.id], "kapatıldı");
await expectError("closed day: return refused", P, `select public.return_item('entry', $1, 'x')`, [entryA], "kapatıldı");
await as(P, `select public.reopen_day($1, $2)`, [branch, dayStr]);
const edited = await as(P, `update public.time_entries set end_at = end_at - interval '5 minutes' where id = $1 returning status`, [entryA]);
ok("reopened day can be edited, status kept", edited.rows[0].status === "approved");
await as(P, `select public.close_day($1, $2)`, [branch, dayStr]);
ok("re-saved", (await as(P, `select closed from public.day_closings where branch_id = $1 and work_date = $2`, [branch, dayStr])).rows[0].closed === true);
ok("employees cannot read day_closings", (await as(K, `select count(*)::int as n from public.day_closings`)).rows[0].n === 0);

// --- manager-added entry, admin ---------------------------------------
const mgrEntry = await as(P, `insert into public.time_entries (user_id, branch_id, start_at, end_at, status) values ($1,$2, now() - interval '50 hours', now() - interval '46 hours', 'approved') returning status`, [B, branch]);
ok("manager-added entry can go in approved", mgrEntry.rows[0].status === "approved");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
