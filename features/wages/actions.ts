"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";

export interface WageActionResult {
  error?: string;
}

const changeWageSchema = z.object({
  hourlyRate: z.coerce.number().gt(0).lt(1000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * S13 "Yeni ücreti kaydet" — INSERTs a new effective-dated row; never updates
 * an existing one, so past days keep recomputing with the old rate
 * (wage_rates_write RLS also blocks a manager from changing their own wage).
 */
export async function changeWageAction(
  userId: string,
  branchSlug: string,
  hourlyRate: unknown,
  effectiveFrom: unknown,
): Promise<WageActionResult> {
  const parsed = changeWageSchema.safeParse({ hourlyRate, effectiveFrom });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz ücret." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("wage_rates").insert({
    user_id: userId,
    hourly_rate: parsed.data.hourlyRate,
    effective_from: parsed.data.effectiveFrom,
  });

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/calisanlar/${userId}`);
  return {};
}
