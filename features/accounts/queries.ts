import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface EmployeeListRow {
  userId: string;
  fullName: string;
  username: string;
  active: boolean;
  hourlyRate: number | null;
  monthMinutes: number;
}

/** S12 Çalışanlar — one DB round trip per field, not per employee. */
export async function getEmployeeList(
  supabase: Client,
  branchId: string,
  month: string,
): Promise<EmployeeListRow[]> {
  const { data: members } = await supabase
    .from("branch_members")
    .select("user_id")
    .eq("branch_id", branchId);

  const memberIds = (members ?? []).map((m) => m.user_id);
  if (memberIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, active, role")
    .in("id", memberIds)
    .eq("role", "employee")
    .order("full_name", { ascending: true });

  const employees = profiles ?? [];
  if (employees.length === 0) return [];

  const ids = employees.map((e) => e.id);
  const [{ data: rates }, { data: earnings }] = await Promise.all([
    supabase.from("wage_rates").select("user_id, hourly_rate, effective_from").in("user_id", ids),
    supabase
      .from("monthly_earnings")
      .select("user_id, approved_minutes, pending_minutes")
      .eq("branch_id", branchId)
      .eq("month", month)
      .in("user_id", ids),
  ]);

  const latestRateByUser = new Map<string, { rate: number; from: string }>();
  for (const row of rates ?? []) {
    const existing = latestRateByUser.get(row.user_id);
    if (!existing || row.effective_from > existing.from) {
      latestRateByUser.set(row.user_id, { rate: row.hourly_rate, from: row.effective_from });
    }
  }

  const minutesByUser = new Map(
    (earnings ?? []).map((row) => [row.user_id, (row.approved_minutes ?? 0) + (row.pending_minutes ?? 0)]),
  );

  return employees.map((employee) => ({
    userId: employee.id,
    fullName: employee.full_name,
    username: employee.username,
    active: employee.active,
    hourlyRate: latestRateByUser.get(employee.id)?.rate ?? null,
    monthMinutes: minutesByUser.get(employee.id) ?? 0,
  }));
}

export interface EmployeeProfile {
  userId: string;
  fullName: string;
  username: string;
  active: boolean;
  startedOn: string | null;
}

export async function getEmployeeProfile(
  supabase: Client,
  userId: string,
): Promise<EmployeeProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, username, active, started_on")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    userId: data.id,
    fullName: data.full_name,
    username: data.username,
    active: data.active,
    startedOn: data.started_on,
  };
}
