import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getBranchDayEntries, type ManagerEntryRow } from "@/features/entries/queries";
import { getBranchDayMaterials, type MaterialReport } from "@/features/materials/queries";
import { getCashCount, type CashCount } from "@/features/cash/queries";
import { getDayCashier } from "@/features/shifts/queries";

type Client = SupabaseClient<Database>;

export interface DayClosing {
  closed: boolean;
  closedAt: string;
  closedByName: string | null;
  reopenedAt: string | null;
}

export async function getDayClosing(supabase: Client, branchId: string, workDate: string): Promise<DayClosing | null> {
  const { data } = await supabase
    .from("day_closings")
    .select("closed, closed_at, closed_by, reopened_at")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .maybeSingle();
  if (!data) return null;
  const { data: profile } = data.closed_by
    ? await supabase.from("profiles").select("full_name").eq("id", data.closed_by).maybeSingle()
    : { data: null };
  return {
    closed: data.closed,
    closedAt: data.closed_at,
    closedByName: profile?.full_name ?? null,
    reopenedAt: data.reopened_at,
  };
}

export interface DaySummary {
  day: string;
  branchName: string;
  cashier: { userId: string; fullName: string } | null;
  entries: ManagerEntryRow[];
  materials: MaterialReport[];
  cash: CashCount | null;
  closing: DayClosing | null;
  /** Profile id → name for every reviewer referenced above. */
  names: Record<string, string>;
  totals: {
    minutes: number;
    cost: number;
    doughS: number;
    doughM: number;
    doughL: number;
  };
  /** Every record approved by the yönetici and the cash count is in — the day can be closed. */
  complete: boolean;
  /** What still blocks closing, in Turkish, for the screen to list. */
  blockers: string[];
}

/** Everything the Gün sonu özeti (screen, print and PDF) shows for one branch/day. */
export async function getDaySummary(
  supabase: Client,
  branch: { id: string; name: string },
  day: string,
): Promise<DaySummary> {
  const [entries, materials, cash, closing, cashier] = await Promise.all([
    getBranchDayEntries(supabase, branch.id, day),
    getBranchDayMaterials(supabase, branch.id, day),
    getCashCount(supabase, branch.id, day),
    getDayClosing(supabase, branch.id, day),
    getDayCashier(supabase, branch.id, day),
  ]);

  const reviewerIds = new Set<string>();
  for (const e of entries) if (e.cashierApprovedBy) reviewerIds.add(e.cashierApprovedBy);
  for (const m of materials) {
    if (m.cashierApprovedBy) reviewerIds.add(m.cashierApprovedBy);
    if (m.approvedBy) reviewerIds.add(m.approvedBy);
  }
  if (cash?.approvedBy) reviewerIds.add(cash.approvedBy);
  const { data: profiles } = reviewerIds.size
    ? await supabase.from("profiles").select("id, full_name").in("id", [...reviewerIds])
    : { data: [] };
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  const blockers: string[] = [];
  const unapprovedEntries = entries.filter((e) => e.status !== "approved").length;
  if (unapprovedEntries > 0) blockers.push(`${unapprovedEntries} mesai kaydı onay bekliyor`);
  const unapprovedMaterials = materials.filter((m) => m.status !== "approved").length;
  if (unapprovedMaterials > 0) blockers.push(`${unapprovedMaterials} malzeme listesi onay bekliyor`);
  if (!cash) blockers.push("Kasa sayımı girilmedi");
  else if (cash.status !== "approved") blockers.push("Kasa sayımı onay bekliyor");

  return {
    day,
    branchName: branch.name,
    cashier,
    entries,
    materials,
    cash,
    closing,
    names,
    totals: {
      minutes: entries.reduce((sum, e) => sum + (e.roundedMinutes ?? 0), 0),
      cost: entries.reduce((sum, e) => sum + (e.amount ?? 0), 0),
      doughS: materials.reduce((sum, m) => sum + m.doughS, 0),
      doughM: materials.reduce((sum, m) => sum + m.doughM, 0),
      doughL: materials.reduce((sum, m) => sum + m.doughL, 0),
    },
    complete: blockers.length === 0,
    blockers,
  };
}

export interface ClosedDayRow {
  workDate: string;
  closed: boolean;
  closedAt: string;
}

/** Past day closings for the "Kapatılan günler" list, newest first. */
export async function getClosedDays(supabase: Client, branchId: string, limit = 60): Promise<ClosedDayRow[]> {
  const { data } = await supabase
    .from("day_closings")
    .select("work_date, closed, closed_at")
    .eq("branch_id", branchId)
    .order("work_date", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({ workDate: row.work_date, closed: row.closed, closedAt: row.closed_at }));
}
