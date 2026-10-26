import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EntryStatus } from "@/types/database";

type Client = SupabaseClient<Database>;
type EntryEarningsRow = Database["public"]["Views"]["entry_earnings"]["Row"];
// Matches ENTRY_EARNINGS_COLUMNS exactly — postgrest-js infers the row shape
// from the select string itself, not the full view Row type.
type SelectedEntryEarningsRow = Pick<
  EntryEarningsRow,
  | "id"
  | "work_date"
  | "start_at"
  | "end_at"
  | "rounded_minutes"
  | "status"
  | "edited_by_employee"
  | "edited_by_manager"
  | "hourly_rate"
  | "amount"
>;

export interface MonthlyEarnings {
  approvedDays: number;
  approvedMinutes: number;
  pendingMinutes: number;
  approvedAmount: number;
  pendingAmount: number;
}

const EMPTY_MONTHLY: MonthlyEarnings = {
  approvedDays: 0,
  approvedMinutes: 0,
  pendingMinutes: 0,
  approvedAmount: 0,
  pendingAmount: 0,
};

/** `month` must be the 1st of the month ('YYYY-MM-01'). */
export async function getMonthlyEarnings(
  supabase: Client,
  userId: string,
  branchId: string,
  month: string,
): Promise<MonthlyEarnings> {
  const { data } = await supabase
    .from("monthly_earnings")
    .select("approved_days, approved_minutes, pending_minutes, approved_amount, pending_amount")
    .eq("user_id", userId)
    .eq("branch_id", branchId)
    .eq("month", month)
    .maybeSingle();

  if (!data) return EMPTY_MONTHLY;
  return {
    approvedDays: data.approved_days,
    approvedMinutes: data.approved_minutes ?? 0,
    pendingMinutes: data.pending_minutes ?? 0,
    approvedAmount: data.approved_amount ?? 0,
    pendingAmount: data.pending_amount ?? 0,
  };
}

export interface EntrySummary {
  id: string;
  workDate: string;
  startAt: string;
  endAt: string | null;
  roundedMinutes: number | null;
  status: EntryStatus;
  editedByEmployee: boolean;
  editedByManager: boolean;
  hourlyRate: number | null;
  amount: number | null;
}

const ENTRY_EARNINGS_COLUMNS =
  "id, work_date, start_at, end_at, rounded_minutes, status, edited_by_employee, edited_by_manager, hourly_rate, amount";

function mapEntry(row: SelectedEntryEarningsRow): EntrySummary {
  return {
    id: row.id,
    workDate: row.work_date,
    startAt: row.start_at,
    endAt: row.end_at,
    roundedMinutes: row.rounded_minutes,
    status: row.status,
    editedByEmployee: row.edited_by_employee,
    editedByManager: row.edited_by_manager,
    hourlyRate: row.hourly_rate,
    amount: row.amount,
  };
}

export async function getEntriesInRange(
  supabase: Client,
  userId: string,
  branchId: string,
  fromDate: string,
  toDate: string,
): Promise<EntrySummary[]> {
  const { data } = await supabase
    .from("entry_earnings")
    .select(ENTRY_EARNINGS_COLUMNS)
    .eq("user_id", userId)
    .eq("branch_id", branchId)
    .gte("work_date", fromDate)
    .lte("work_date", toDate)
    .order("start_at", { ascending: false });

  return (data ?? []).map(mapEntry);
}

export async function getRecentEntries(
  supabase: Client,
  userId: string,
  branchId: string,
  limit: number,
): Promise<EntrySummary[]> {
  const { data } = await supabase
    .from("entry_earnings")
    .select(ENTRY_EARNINGS_COLUMNS)
    .eq("user_id", userId)
    .eq("branch_id", branchId)
    .order("start_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(mapEntry);
}

export interface ManagerEntryRow extends EntrySummary {
  userId: string;
  fullName: string;
}

/** S9 Gün sonu onayı: every entry for one branch/day, with the employee's name attached. */
export async function getBranchDayEntries(
  supabase: Client,
  branchId: string,
  workDate: string,
): Promise<ManagerEntryRow[]> {
  const { data } = await supabase
    .from("entry_earnings")
    .select(`user_id, ${ENTRY_EARNINGS_COLUMNS}`)
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .order("start_at", { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((row) => ({
    ...mapEntry(row),
    userId: row.user_id,
    fullName: nameById.get(row.user_id) ?? "—",
  }));
}

export async function getEntryById(
  supabase: Client,
  entryId: string,
): Promise<EntrySummary | null> {
  const { data } = await supabase
    .from("entry_earnings")
    .select(ENTRY_EARNINGS_COLUMNS)
    .eq("id", entryId)
    .maybeSingle();

  return data ? mapEntry(data) : null;
}
