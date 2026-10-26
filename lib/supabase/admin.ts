import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client — bypasses RLS entirely. NEVER import this outside
 * `features/accounts/**` or `scripts/**` (enforced by eslint.config.mjs's
 * no-restricted-imports rule). Every call site must check the caller's own
 * rights first with their own session client (`rpc('manages_user')` /
 * `rpc('is_branch_manager')`) before touching this (CLAUDE.md golden rule 2).
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
