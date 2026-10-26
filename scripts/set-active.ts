/**
 * (De)activate any account by username — including an admin, which the UI deliberately can't do
 * (`manages_user` never lets an admin manage another admin).
 *
 *   npm run set-active -- --username admin --inactive
 *   npm run set-active -- --username admin --active
 *
 * Same env handling as scripts/create-user.ts (--env, default .env.local).
 */
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: {
    env: { type: 'string', default: '.env.local' },
    username: { type: 'string' },
    active: { type: 'boolean', default: false },
    inactive: { type: 'boolean', default: false },
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
const username = (values.username ?? fail('--username required')).trim().toLowerCase();
if (values.active === values.inactive) fail('pass exactly one of --active / --inactive');
const active = values.active;

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, role')
    .eq('username', username)
    .maybeSingle();
  if (error) fail(error.message);
  if (!profile) fail(`no account with username ${username}`);

  const { error: banError } = await admin.auth.admin.updateUserById(profile.id, {
    ban_duration: active ? 'none' : '876000h',
  });
  if (banError) fail(banError.message);

  const { error: pErr } = await admin.from('profiles').update({ active }).eq('id', profile.id);
  if (pErr) fail(pErr.message);

  console.log(`✓ ${profile.role} ${username} is now ${active ? 'active' : 'inactive'}`);
}

main();
