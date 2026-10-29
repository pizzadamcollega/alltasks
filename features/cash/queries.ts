import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ReviewStatus } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface CashCount {
  id: string;
  userId: string | null;
  cashierName: string | null;
  workDate: string;
  openingFloat: number;
  online: number;
  kiosk: number;
  contant: number;
  total: number;
  note: string | null;
  status: ReviewStatus;
  approvedBy: string | null;
  returnNote: string | null;
}

/** The day's till count for a branch (visible to that day's kasacı and the managers). */
export async function getCashCount(
  supabase: Client,
  branchId: string,
  workDate: string,
): Promise<CashCount | null> {
  const { data } = await supabase
    .from("cash_counts")
    .select("id, user_id, work_date, opening_float, online, kiosk, contant, total, note, status, approved_by, return_note")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (!data) return null;

  const { data: profile } = data.user_id
    ? await supabase.from("profiles").select("full_name").eq("id", data.user_id).maybeSingle()
    : { data: null };

  return {
    id: data.id,
    userId: data.user_id,
    cashierName: profile?.full_name ?? null,
    workDate: data.work_date,
    openingFloat: Number(data.opening_float),
    online: Number(data.online),
    kiosk: Number(data.kiosk),
    contant: Number(data.contant),
    total: Number(data.total),
    note: data.note,
    status: data.status,
    approvedBy: data.approved_by,
    returnNote: data.return_note,
  };
}
