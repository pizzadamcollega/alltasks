import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ShiftRequestStatus } from "@/types/database";
import { addDaysToDate, weekDates } from "@/lib/time";

type Client = SupabaseClient<Database>;

export interface ShiftRow {
  id: string;
  userId: string;
  fullName: string;
  /** "HH:mm" */
  startTime: string;
}

export interface ShiftDay {
  date: string;
  shifts: ShiftRow[];
}

/** The weekly board for one branch: 7 days, each sorted by start time then name. */
export async function getWeekShifts(
  supabase: Client,
  branchId: string,
  monday: string,
): Promise<ShiftDay[]> {
  const { data } = await supabase
    .from("shifts")
    .select("id, user_id, work_date, start_time")
    .eq("branch_id", branchId)
    .gte("work_date", monday)
    .lte("work_date", addDaysToDate(monday, 6));

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return weekDates(monday).map((date) => ({
    date,
    shifts: rows
      .filter((row) => row.work_date === date)
      .map((row) => ({
        id: row.id,
        userId: row.user_id,
        fullName: nameById.get(row.user_id) ?? "—",
        startTime: row.start_time.slice(0, 5),
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.fullName.localeCompare(b.fullName, "tr")),
  }));
}

/** When a future week's board was made visible to employees; null while it is still a draft. */
export async function getWeekPublication(
  supabase: Client,
  branchId: string,
  monday: string,
): Promise<{ publishedAt: string } | null> {
  const { data } = await supabase
    .from("shift_week_publications")
    .select("published_at")
    .eq("branch_id", branchId)
    .eq("week_start", monday)
    .maybeSingle();
  return data ? { publishedAt: data.published_at } : null;
}

export interface ShiftRequestRow {
  id: string;
  userId: string;
  fullName: string;
  workDate: string;
  /** "HH:mm" */
  startTime: string;
  note: string | null;
  status: ShiftRequestStatus;
}

/**
 * Requests for one week. RLS returns only the caller's own rows to an
 * employee and every row of the branch to a manager — same query for both.
 */
export async function getWeekRequests(
  supabase: Client,
  branchId: string,
  monday: string,
): Promise<ShiftRequestRow[]> {
  const { data } = await supabase
    .from("shift_requests")
    .select("id, user_id, work_date, start_time, note, status")
    .eq("branch_id", branchId)
    .gte("work_date", monday)
    .lte("work_date", addDaysToDate(monday, 6));

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      fullName: nameById.get(row.user_id) ?? "—",
      workDate: row.work_date,
      startTime: row.start_time.slice(0, 5),
      note: row.note,
      status: row.status,
    }))
    .sort(
      (a, b) =>
        a.workDate.localeCompare(b.workDate) ||
        a.startTime.localeCompare(b.startTime) ||
        a.fullName.localeCompare(b.fullName, "tr"),
    );
}

/** Pending requests from `fromDate` on, plus the earliest such day, for the manager's home-page reminder. */
export async function getPendingRequestSummary(
  supabase: Client,
  branchId: string,
  fromDate: string,
): Promise<{ count: number; firstDate: string | null }> {
  const { data, count } = await supabase
    .from("shift_requests")
    .select("work_date", { count: "exact" })
    .eq("branch_id", branchId)
    .eq("status", "pending")
    .gte("work_date", fromDate)
    .order("work_date", { ascending: true })
    .limit(1);
  return { count: count ?? 0, firstDate: data?.[0]?.work_date ?? null };
}
