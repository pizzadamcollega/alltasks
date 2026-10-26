import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EntryStatus } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface DailyBranchCost {
  people: number;
  minutes: number;
  approvedAmount: number;
  pendingAmount: number;
  openEntries: number;
  pendingEntries: number;
}

const EMPTY_DAILY: DailyBranchCost = {
  people: 0,
  minutes: 0,
  approvedAmount: 0,
  pendingAmount: 0,
  openEntries: 0,
  pendingEntries: 0,
};

export async function getDailyBranchCost(
  supabase: Client,
  branchId: string,
  workDate: string,
): Promise<DailyBranchCost> {
  const { data } = await supabase
    .from("daily_branch_cost")
    .select("people, minutes, approved_amount, pending_amount, open_entries, pending_entries")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .maybeSingle();

  if (!data) return EMPTY_DAILY;
  return {
    people: data.people,
    minutes: data.minutes ?? 0,
    approvedAmount: data.approved_amount ?? 0,
    pendingAmount: data.pending_amount ?? 0,
    openEntries: data.open_entries,
    pendingEntries: data.pending_entries,
  };
}

export interface MonthlyBranchCost {
  approvedAmount: number;
  pendingAmount: number;
  approvedMinutes: number;
  pendingRecordCount: number;
}

/** monthly_earnings is per person; summed here to a branch total (no branch-level view exists). */
export async function getMonthlyBranchCost(
  supabase: Client,
  branchId: string,
  month: string,
): Promise<MonthlyBranchCost> {
  const { data } = await supabase
    .from("monthly_earnings")
    .select("approved_amount, pending_amount, approved_minutes, pending_minutes")
    .eq("branch_id", branchId)
    .eq("month", month);

  const rows = data ?? [];
  return {
    approvedAmount: rows.reduce((sum, r) => sum + (r.approved_amount ?? 0), 0),
    pendingAmount: rows.reduce((sum, r) => sum + (r.pending_amount ?? 0), 0),
    approvedMinutes: rows.reduce((sum, r) => sum + (r.approved_minutes ?? 0), 0),
    pendingRecordCount: rows.filter((r) => (r.pending_minutes ?? 0) > 0).length,
  };
}

export interface BranchEmployee {
  userId: string;
  fullName: string;
}

/** Active employees (not patron/admin) belonging to this branch, for pickers and lists. */
export async function getBranchEmployees(supabase: Client, branchId: string): Promise<BranchEmployee[]> {
  const { data: members } = await supabase
    .from("branch_members")
    .select("user_id")
    .eq("branch_id", branchId);

  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds)
    .eq("role", "employee")
    .eq("active", true)
    .order("full_name", { ascending: true });

  return (profiles ?? []).map((p) => ({ userId: p.id, fullName: p.full_name }));
}

export interface TodayStaffRow {
  userId: string;
  fullName: string;
  status: EntryStatus;
  startAt: string;
  endAt: string | null;
  roundedMinutes: number | null;
}

/** One row per person for `workDate`: their open shift if any, else their latest. */
export async function getTodayStaff(
  supabase: Client,
  branchId: string,
  workDate: string,
): Promise<TodayStaffRow[]> {
  const { data: entries } = await supabase
    .from("time_entries")
    .select("user_id, start_at, end_at, rounded_minutes, status")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .order("start_at", { ascending: true });

  if (!entries || entries.length === 0) return [];

  const byUser = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    const existing = byUser.get(entry.user_id);
    if (!existing || entry.status === "open" || existing.status !== "open") {
      byUser.set(entry.user_id, entry);
    }
  }

  const userIds = [...byUser.keys()];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return userIds.map((userId) => {
    const entry = byUser.get(userId)!;
    return {
      userId,
      fullName: nameById.get(userId) ?? "—",
      status: entry.status,
      startAt: entry.start_at,
      endAt: entry.end_at,
      roundedMinutes: entry.rounded_minutes,
    };
  });
}
