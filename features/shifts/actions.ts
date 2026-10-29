"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";
import { addDaysToDate } from "@/lib/time";
import { getBranchEmployees } from "@/features/branch/queries";
import { decideShiftRequestSchema, submitShiftRequestsSchema, upsertShiftSchema } from "./validation";

export interface ShiftActionResult {
  error?: string;
  copied?: number;
  count?: number;
}

function revalidateBoard(branchSlug: string) {
  revalidatePath(`/${branchSlug}`);
  revalidatePath(`/${branchSlug}/program`);
}

/**
 * Program: put someone on a day, or change their start time if they're
 * already on it (unique branch/user/day). `shifts_write` RLS is the real
 * check — only a manager of this branch gets past it.
 */
export async function upsertShiftAction(
  branchId: string,
  branchSlug: string,
  input: unknown,
): Promise<ShiftActionResult> {
  const parsed = upsertShiftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }

  const supabase = await createClient();
  const { userId, workDate, startTime } = parsed.data;
  const { error } = await supabase
    .from("shifts")
    .upsert(
      { branch_id: branchId, user_id: userId, work_date: workDate, start_time: startTime },
      { onConflict: "branch_id,user_id,work_date" },
    );
  if (error) return { error: toErrorMessage(error) };

  revalidateBoard(branchSlug);
  return {};
}

/** D-48: make someone on the day the kasacı (null = nobody). `set_day_cashier` checks rights and duty. */
export async function setDayCashierAction(
  branchId: string,
  branchSlug: string,
  workDate: string,
  userId: string | null,
): Promise<ShiftActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return { error: "Geçersiz gün." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_day_cashier", {
    p_branch: branchId,
    p_date: workDate,
    p_user: userId,
  });
  if (error) return { error: toErrorMessage(error) };

  revalidateBoard(branchSlug);
  revalidatePath(`/${branchSlug}`, "layout");
  return {};
}

export async function deleteShiftAction(
  shiftId: string,
  branchSlug: string,
): Promise<ShiftActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", shiftId);
  if (error) return { error: toErrorMessage(error) };

  revalidateBoard(branchSlug);
  return {};
}

/** "Geçen haftayı kopyala": same people, same weekday, same start time — existing rows are kept. */
export async function copyPreviousWeekAction(
  branchId: string,
  branchSlug: string,
  monday: string,
): Promise<ShiftActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) return { error: "Geçersiz hafta." };

  const supabase = await createClient();
  const previousMonday = addDaysToDate(monday, -7);
  const { data: previous, error: readError } = await supabase
    .from("shifts")
    .select("user_id, work_date, start_time")
    .eq("branch_id", branchId)
    .gte("work_date", previousMonday)
    .lte("work_date", addDaysToDate(previousMonday, 6));
  if (readError) return { error: toErrorMessage(readError) };
  if (!previous?.length) return { error: "Geçen hafta için program yok." };

  // someone deactivated since last week would make the whole batch fail the trigger
  const activeIds = new Set((await getBranchEmployees(supabase, branchId)).map((e) => e.userId));
  const toCopy = previous.filter((row) => activeIds.has(row.user_id));
  if (toCopy.length === 0) return { copied: 0 };

  const { data: inserted, error } = await supabase
    .from("shifts")
    .upsert(
      toCopy.map((row) => ({
        branch_id: branchId,
        user_id: row.user_id,
        work_date: addDaysToDate(row.work_date, 7),
        start_time: row.start_time,
      })),
      { onConflict: "branch_id,user_id,work_date", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { error: toErrorMessage(error) };

  revalidateBoard(branchSlug);
  return { copied: inserted?.length ?? 0 };
}

const isMonday = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).getUTCDay() === 1;

/**
 * Employee "Onaya gönder": the chosen days of one future week replace the
 * caller's still-pending requests for it. `submit_shift_requests` enforces
 * who/which week; decided days are left untouched there.
 */
export async function submitShiftRequestsAction(
  branchId: string,
  branchSlug: string,
  input: unknown,
): Promise<ShiftActionResult> {
  const parsed = submitShiftRequestsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }
  const { monday, days, note } = parsed.data;
  if (!isMonday(monday)) return { error: "Geçersiz hafta." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_shift_requests", {
    p_branch: branchId,
    p_week: monday,
    p_days: days.map((day) => ({ date: day.date, start: day.start, note: note ?? "" })),
  });
  if (error) return { error: toErrorMessage(error) };

  revalidateBoard(branchSlug);
  return { count: data ?? 0 };
}

/** Manager: approve (optionally at another start time) or reject one request. */
export async function decideShiftRequestAction(branchSlug: string, input: unknown): Promise<ShiftActionResult> {
  const parsed = decideShiftRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }

  const supabase = await createClient();
  const { requestId, approve, startTime } = parsed.data;
  const { error } = await supabase.rpc("decide_shift_request", {
    p_request: requestId,
    p_approve: approve,
    ...(startTime ? { p_start: startTime } : {}),
  });
  if (error) return { error: toErrorMessage(error) };

  revalidateBoard(branchSlug);
  return {};
}

export async function approvePendingRequestsAction(
  branchId: string,
  branchSlug: string,
  monday: string,
): Promise<ShiftActionResult> {
  if (!isMonday(monday)) return { error: "Geçersiz hafta." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_pending_shift_requests", {
    p_branch: branchId,
    p_week: monday,
  });
  if (error) return { error: toErrorMessage(error) };

  revalidateBoard(branchSlug);
  return { count: data ?? 0 };
}

/** "Programı yayınla" / "Yayından kaldır" — RLS lets only this branch's managers write. */
export async function setWeekPublishedAction(
  branchId: string,
  branchSlug: string,
  monday: string,
  published: boolean,
): Promise<ShiftActionResult> {
  if (!isMonday(monday)) return { error: "Geçersiz hafta." };

  const supabase = await createClient();
  const { error } = published
    ? await supabase
        .from("shift_week_publications")
        .upsert({ branch_id: branchId, week_start: monday }, { onConflict: "branch_id,week_start", ignoreDuplicates: true })
    : await supabase.from("shift_week_publications").delete().eq("branch_id", branchId).eq("week_start", monday);
  if (error) return { error: toErrorMessage(error) };

  revalidateBoard(branchSlug);
  return {};
}
