"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";

export interface ClockActionResult {
  error?: string;
}

/** S2: Başla. Server time only — the client never sends a start time. */
export async function clockInAction(
  branchId: string,
  branchSlug: string,
): Promise<ClockActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("clock_in", { p_branch: branchId });
  if (error) return { error: toErrorMessage(error) };
  revalidatePath(`/${branchSlug}`);
  return {};
}

/** S2: Bitir. */
export async function clockOutAction(branchSlug: string): Promise<ClockActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("clock_out");
  if (error) return { error: toErrorMessage(error) };
  revalidatePath(`/${branchSlug}`);
  return {};
}
