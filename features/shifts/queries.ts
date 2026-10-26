import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
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
