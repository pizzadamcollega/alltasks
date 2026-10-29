import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ReviewStatus } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface MaterialReport {
  id: string;
  userId: string;
  fullName: string;
  workDate: string;
  doughS: number;
  doughM: number;
  doughL: number;
  note: string | null;
  status: ReviewStatus;
  cashierApprovedBy: string | null;
  approvedBy: string | null;
  returnNote: string | null;
}

const COLUMNS =
  "id, user_id, work_date, dough_s, dough_m, dough_l, note, status, cashier_approved_by, approved_by, return_note";

type Row = Pick<
  Database["public"]["Tables"]["material_reports"]["Row"],
  | "id"
  | "user_id"
  | "work_date"
  | "dough_s"
  | "dough_m"
  | "dough_l"
  | "note"
  | "status"
  | "cashier_approved_by"
  | "approved_by"
  | "return_note"
>;

function mapRow(row: Row, fullName: string): MaterialReport {
  return {
    id: row.id,
    userId: row.user_id,
    fullName,
    workDate: row.work_date,
    doughS: row.dough_s,
    doughM: row.dough_m,
    doughL: row.dough_l,
    note: row.note,
    status: row.status,
    cashierApprovedBy: row.cashier_approved_by,
    approvedBy: row.approved_by,
    returnNote: row.return_note,
  };
}

export async function getMyMaterialReport(
  supabase: Client,
  userId: string,
  branchId: string,
  workDate: string,
): Promise<MaterialReport | null> {
  const { data } = await supabase
    .from("material_reports")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .maybeSingle();
  return data ? mapRow(data, "") : null;
}

/** Every usta's report for one branch/day (kasacı of that day or a manager), names attached. */
export async function getBranchDayMaterials(
  supabase: Client,
  branchId: string,
  workDate: string,
): Promise<MaterialReport[]> {
  const { data } = await supabase
    .from("material_reports")
    .select(COLUMNS)
    .eq("branch_id", branchId)
    .eq("work_date", workDate);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set(rows.map((r) => r.user_id))]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows
    .map((row) => mapRow(row, nameById.get(row.user_id) ?? "—"))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "tr"));
}

/** "+3" / "−5" / "0" — the sign is the meaning (extra vs short), so always show it. */
export function formatDough(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}
