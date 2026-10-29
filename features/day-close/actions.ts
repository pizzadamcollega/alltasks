"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";

export interface DayCloseActionResult {
  error?: string;
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * D-49 "Kaydet ve kapat": `close_day` refuses while anything is unapproved
 * or the cash count is missing, stores a snapshot and locks the day.
 */
export async function closeDayAction(
  branchId: string,
  branchSlug: string,
  workDate: string,
): Promise<DayCloseActionResult> {
  if (!isDate(workDate)) return { error: "Geçersiz gün." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_day", { p_branch: branchId, p_date: workDate });
  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}`, "layout");
  return {};
}

/** D-49 "Düzenle": unlocks a closed day so records can be changed, then it is saved again. */
export async function reopenDayAction(
  branchId: string,
  branchSlug: string,
  workDate: string,
): Promise<DayCloseActionResult> {
  if (!isDate(workDate)) return { error: "Geçersiz gün." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_day", { p_branch: branchId, p_date: workDate });
  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}`, "layout");
  return {};
}
