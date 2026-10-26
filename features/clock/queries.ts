import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface OpenEntry {
  id: string;
  branchId: string;
  startAt: string;
}

/** At most one open entry exists per user, across both branches (DB constraint). */
export async function getOpenEntry(supabase: Client, userId: string): Promise<OpenEntry | null> {
  const { data } = await supabase
    .from("time_entries")
    .select("id, branch_id, start_at")
    .eq("user_id", userId)
    .eq("status", "open")
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, branchId: data.branch_id, startAt: data.start_at };
}
