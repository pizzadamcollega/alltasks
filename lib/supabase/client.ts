import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/** Browser client for Client Components. Session comes from cookies set by middleware. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
