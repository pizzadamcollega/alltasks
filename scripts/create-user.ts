/**
 * Create an admin, patron or employee account (auth user + profile + memberships + first wage).
 *
 *   npm run create-user -- --role admin    --username furkan        --name "Furkan Hüner" --password '…'
 *   npm run create-user -- --role patron   --username patron.pijp   --name "…" --password '…' --branches de-pijp
 *   npm run create-user -- --role employee --username ahmet.yilmaz  --name "Ahmet Yılmaz" --password '…' \
 *                          --branches de-pijp,zuid --rate 13.00 --from 2026-11-01 --duties bezorgd,usta
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STAFF_EMAIL_DOMAIN from --env
 * (default .env.local). For production: --env .env.production.local
 */
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const ROLES = ['admin', 'patron', 'employee'] as const;
type Role = (typeof ROLES)[number];

const { values } = parseArgs({
  options: {
    env: { type: 'string', default: '.env.local' },
    role: { type: 'string', default: 'employee' },
    username: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
    branches: { type: 'string', default: '' },
    rate: { type: 'string' },
    from: { type: 'string' },
    duties: { type: 'string', default: '' },
  },
});

try {
  process.loadEnvFile(values.env!);
} catch {
  // variables may already be in the environment
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fail('NEXT_PUBLIC_SUPABASE_URL missing');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fail('SUPABASE_SERVICE_ROLE_KEY missing');
const domain = process.env.STAFF_EMAIL_DOMAIN ?? 'staff.pizzadam.invalid';

const role = values.role as Role;
if (!ROLES.includes(role)) fail(`--role must be one of ${ROLES.join(', ')}`);
const username = (values.username ?? fail('--username required')).trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) fail('username: 3–32 chars, a-z 0-9 . _ -');
const fullName = (values.name ?? fail('--name required')).trim();
const password = values.password ?? fail('--password required');
if (password.length < 8) fail('password must be at least 8 characters');
const slugs = values.branches!.split(',').map((s) => s.trim()).filter(Boolean);
if (role === 'patron' && slugs.length !== 1) fail('a patron needs exactly one --branches slug');
if (role === 'employee' && slugs.length === 0) fail('an employee needs at least one branch');
if (role === 'employee' && !values.rate) fail('an employee needs --rate');
const rate = values.rate ? Number(values.rate) : null;
if (rate !== null && !(rate > 0 && rate < 1000)) fail('--rate must be a positive number like 13.00');
const DUTIES = ['kasaci', 'bezorgd', 'usta'];
const duties = values.duties!.split(',').map((s) => s.trim()).filter(Boolean);
if (duties.some((d) => !DUTIES.includes(d))) fail(`--duties must be from ${DUTIES.join(', ')}`);
if (role === 'employee' && duties.length === 0) fail('an employee needs --duties (e.g. bezorgd)');
const effectiveFrom = values.from ?? new Date().toISOString().slice(0, 10);

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: branches, error: bErr } = await admin.from('branches').select('id, slug').in('slug', slugs.length ? slugs : ['-']);
  if (bErr) fail(bErr.message);
  const missing = slugs.filter((s) => !branches?.some((b) => b.slug === s));
  if (missing.length) fail(`unknown branch: ${missing.join(', ')}`);

  const email = `${username}@${domain}`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (cErr || !created.user) fail(cErr?.message ?? 'could not create auth user');
  const id = created.user.id;

  try {
    const { error: pErr } = await admin.from('profiles').insert({ id, full_name: fullName, username, role, duties: role === 'employee' ? duties : [] });
    if (pErr) throw pErr;
    if (branches?.length) {
      const { error: mErr } = await admin
        .from('branch_members')
        .insert(branches.map((b) => ({ user_id: id, branch_id: b.id })));
      if (mErr) throw mErr;
    }
    if (rate !== null) {
      const { error: wErr } = await admin
        .from('wage_rates')
        .insert({ user_id: id, hourly_rate: rate, effective_from: effectiveFrom });
      if (wErr) throw wErr;
    }
  } catch (e) {
    await admin.auth.admin.deleteUser(id);
    fail(`rolled back: ${(e as Error).message}`);
  }

  console.log(`✓ ${role} ${username} (${fullName}) created`);
  if (slugs.length) console.log(`  branches: ${slugs.join(', ')}`);
  if (rate !== null) console.log(`  rate: €${rate.toFixed(2)} from ${effectiveFrom}`);
  for (const s of slugs) console.log(`  login: ${process.env.APP_BASE_URL ?? ''}/${s}/giris`);
}

main();
