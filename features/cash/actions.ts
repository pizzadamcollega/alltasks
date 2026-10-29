"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";
import { cashCountSchema } from "./validation";

export interface CashActionResult {
  error?: string;
}

/**
 * D-48 "Yöneticiye gönder": the day's kasacı saves the till count (one per
 * branch per day; sending again overwrites it). `cash_counts_before_write`
 * only lets the day's kasacı (or a manager) write, and never after approval.
 */
export async function saveCashCountAction(
  branchId: string,
  branchSlug: string,
  input: unknown,
): Promise<CashActionResult> {
  const parsed = cashCountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: "Oturum bulunamadı, tekrar giriş yap." };

  const { workDate, openingFloat, online, kiosk, contant, note } = parsed.data;
  const { error } = await supabase.from("cash_counts").upsert(
    {
      branch_id: branchId,
      user_id: userId,
      work_date: workDate,
      opening_float: openingFloat,
      online,
      kiosk,
      contant,
      note,
    },
    { onConflict: "branch_id,work_date" },
  );
  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}`, "layout");
  return {};
}
