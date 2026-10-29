/**
 * LOCAL ONLY — creates the test users from docs/TEST-PLAN.md §3, wages, a published current week
 * and a few time entries (yesterday pending, earlier approved). Safe to re-run after `npm run db:reset`.
 *
 *   npm run db:seed-users
 */
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // variables may already be in the environment
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const domain = process.env.STAFF_EMAIL_DOMAIN ?? 'staff.pizzadam.invalid';
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error('✗ refusing to seed a non-local database');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = 'Test1234!';

type Seed = { username: string; name: string; role: 'admin' | 'patron' | 'employee'; branches: string[]; rate?: number; duties?: string[] };
const USERS: Seed[] = [
  { username: 'admin', name: 'Admin Test', role: 'admin', branches: [] },
  { username: 'patron.pijp', name: 'Patron De Pijp', role: 'patron', branches: ['de-pijp'] },
  { username: 'patron.zuid', name: 'Patron Zuid', role: 'patron', branches: ['zuid'] },
  { username: 'ahmet', name: 'Ahmet Yılmaz', role: 'employee', branches: ['de-pijp'], rate: 13, duties: ['bezorgd', 'usta'] },
  { username: 'elif', name: 'Elif Kaya', role: 'employee', branches: ['de-pijp', 'zuid'], rate: 12.5 },
  { username: 'murat', name: 'Murat Demir', role: 'employee', branches: ['de-pijp'], rate: 14, duties: ['kasaci'] },
  { username: 'can', name: 'Can Öztürk', role: 'employee', branches: ['de-pijp'], rate: 13.5 },
  { username: 'sena', name: 'Sena Aksoy', role: 'employee', branches: ['de-pijp'], rate: 13 },
  { username: 'deniz', name: 'Deniz Arslan', role: 'employee', branches: ['de-pijp'], rate: 12.75 },
  { username: 'zeynep', name: 'Zeynep Şahin', role: 'employee', branches: ['zuid'], rate: 13 },
];

/** Amsterdam wall-clock time → ISO string (handles CET/CEST). */
function ams(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime())).toISOString();
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

async function main() {
  const { data: branches } = await db.from('branches').select('id, slug');
  const branchId = (slug: string) => branches!.find((b) => b.slug === slug)!.id as string;
  const ids: Record<string, string> = {};

  for (const u of USERS) {
    const email = `${u.username}@${domain}`;
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    const existing = list.users.find((x) => x.email === email);
    if (existing) await db.auth.admin.deleteUser(existing.id);
    const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    ids[u.username] = data.user.id;
    await db.from('profiles').insert({ id: data.user.id, full_name: u.name, username: u.username, role: u.role, started_on: '2026-03-01', duties: u.role === 'employee' ? (u.duties ?? ['bezorgd']) : [] });
    if (u.branches.length)
      await db.from('branch_members').insert(u.branches.map((b) => ({ user_id: data.user.id, branch_id: branchId(b) })));
    if (u.rate) await db.from('wage_rates').insert({ user_id: data.user.id, hourly_rate: u.rate, effective_from: '2026-01-01' });
  }

  // schedule weeks + a published current week in De Pijp
  await db.rpc('run_schedule_jobs');
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const monday = addDays(today, -dow);
  const { data: week } = await db
    .from('schedule_weeks').select('id').eq('branch_id', branchId('de-pijp')).eq('week_start', monday).single();
  const plan: Record<string, number[]> = {
    ahmet: [0, 2, 4, 5, 6], elif: [0, 1, 3, 4, 5], murat: [0, 1, 3, 4, 5, 6],
    can: [0, 2, 3, 4, 5], sena: [1, 2, 3, 5, 6], deniz: [1, 2, 4, 6],
  };
  await db.from('schedule_assignments').delete().eq('week_id', week!.id);
  await db.from('schedule_assignments').insert(
    Object.entries(plan).flatMap(([u, days]) =>
      days.map((d) => ({ week_id: week!.id, branch_id: branchId('de-pijp'), user_id: ids[u], work_date: addDays(monday, d), source: 'manager' }))),
  );
  await db.from('schedule_weeks').update({ status: 'locked', published_at: new Date().toISOString() }).eq('id', week!.id);

  // time entries: last 7 days for De Pijp people; yesterday stays pending, older approved
  const rows = [];
  for (let back = 7; back >= 1; back--) {
    const day = addDays(today, -back);
    for (const [u, start, end] of [['ahmet', '16:55', '01:30'], ['elif', '17:00', '02:05'], ['murat', '16:00', '00:30'], ['can', '16:30', '23:15']] as const) {
      const endDay = end < start ? addDays(day, 1) : day;
      rows.push({
        user_id: ids[u], branch_id: branchId('de-pijp'),
        start_at: ams(day, start), end_at: ams(endDay, end),
        status: back === 1 ? 'pending' : 'approved',
      });
    }
  }
  const { error: eErr } = await db.from('time_entries').insert(rows);
  if (eErr) throw eErr;
  // one forgotten Bitir yesterday
  await db.from('time_entries').insert({ user_id: ids.sena, branch_id: branchId('de-pijp'), start_at: ams(addDays(today, -1), '18:00') });

  console.log(`✓ seeded ${USERS.length} users (password ${PASSWORD}), current week published, ${rows.length + 1} entries`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
