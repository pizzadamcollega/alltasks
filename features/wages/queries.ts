import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface WageRate {
  id: string;
  hourlyRate: number;
  effectiveFrom: string;
}

/** The rate effective on `asOfDate` ('YYYY-MM-DD') — the latest row with effective_from <= that date. */
export async function getCurrentRate(
  supabase: Client,
  userId: string,
  asOfDate: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("wage_rates")
    .select("hourly_rate")
    .eq("user_id", userId)
    .lte("effective_from", asOfDate)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.hourly_rate ?? null;
}

/** Full history, newest first — used by S13 (manager) and S5 (employee, current row only). */
export async function getRateHistory(supabase: Client, userId: string): Promise<WageRate[]> {
  const { data } = await supabase
    .from("wage_rates")
    .select("id, hourly_rate, effective_from")
    .eq("user_id", userId)
    .order("effective_from", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    hourlyRate: row.hourly_rate,
    effectiveFrom: row.effective_from,
  }));
}
