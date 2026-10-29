import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole, Database, StaffDuty } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface EmployeeListRow {
  userId: string;
  fullName: string;
  username: string;
  active: boolean;
  duties: StaffDuty[];
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
    .select("id, full_name, username, active, role, duties")
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
    duties: employee.duties ?? [],
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
  role: AppRole;
  duties: StaffDuty[];
}

export async function getEmployeeProfile(
  supabase: Client,
  userId: string,
): Promise<EmployeeProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, username, active, started_on, role, duties")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    userId: data.id,
    fullName: data.full_name,
    username: data.username,
    active: data.active,
    startedOn: data.started_on,
    role: data.role,
    duties: data.duties ?? [],
  };
}

export interface BranchOption {
  id: string;
  slug: string;
  name: string;
}

/** Every branch the caller can see — for an admin (`branches_select` RLS) that is all of them. */
export async function getBranchOptions(supabase: Client): Promise<BranchOption[]> {
  const { data } = await supabase
    .from("branches")
    .select("id, slug, name")
    .order("name", { ascending: true });
  return data ?? [];
}

export interface ManagerListRow {
  userId: string;
  fullName: string;
  username: string;
  active: boolean;
  branchNames: string[];
}

/** Admin "Yöneticiler" tab — every patron account, across all branches. */
export async function getManagerList(supabase: Client): Promise<ManagerListRow[]> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, active")
    .eq("role", "patron")
    .order("full_name", { ascending: true });

  const managers = profiles ?? [];
  if (managers.length === 0) return [];

  const [{ data: members }, branches] = await Promise.all([
    supabase
      .from("branch_members")
      .select("user_id, branch_id")
      .in(
        "user_id",
        managers.map((m) => m.id),
      ),
    getBranchOptions(supabase),
  ]);

  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const namesByUser = new Map<string, string[]>();
  for (const row of members ?? []) {
    const name = branchName.get(row.branch_id);
    if (name) namesByUser.set(row.user_id, [...(namesByUser.get(row.user_id) ?? []), name]);
  }

  return managers.map((manager) => ({
    userId: manager.id,
    fullName: manager.full_name,
    username: manager.username,
    active: manager.active,
    branchNames: namesByUser.get(manager.id) ?? [],
  }));
}
