"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";
import { materialReportSchema } from "./validation";

export interface MaterialActionResult {
  error?: string;
}

/**
 * D-47 usta "Onaya gönder": one report per usta per day, sending again
 * overwrites it and puts it back at the kasacı. `material_reports_before_write`
 * checks the usta duty, the day (today or yesterday) and that no reviewer
 * signed it off yet.
 */
export async function saveMaterialReportAction(
  branchId: string,
  branchSlug: string,
  input: unknown,
): Promise<MaterialActionResult> {
  const parsed = materialReportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: "Oturum bulunamadı, tekrar giriş yap." };

  const { workDate, doughS, doughM, doughL, note } = parsed.data;
  const { error } = await supabase.from("material_reports").upsert(
    {
      branch_id: branchId,
      user_id: userId,
      work_date: workDate,
      dough_s: doughS,
      dough_m: doughM,
      dough_l: doughL,
      note,
    },
    { onConflict: "branch_id,user_id,work_date" },
  );
  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}`, "layout");
  return {};
}
