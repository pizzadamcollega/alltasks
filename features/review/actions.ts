"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";

export interface ReviewActionResult {
  error?: string;
  count?: number;
}

const kindSchema = z.enum(["entry", "material", "cash"]);
const idsSchema = z.array(z.uuid()).min(1);
const returnSchema = z.object({
  kind: kindSchema,
  id: z.uuid(),
  note: z.string().trim().min(1, "Geri gönderme sebebini yaz.").max(300, "Not en fazla 300 karakter olabilir."),
});

// kasa, onay and the employee's home all show review state
function revalidateReview(branchSlug: string) {
  revalidatePath(`/${branchSlug}`, "layout");
}

/**
 * D-46 kasacı step. `cashier_approve` only touches pending rows of colleagues
 * on a day the caller is the kasacı — anything else is silently skipped, so
 * the count tells the screen what actually happened.
 */
export async function cashierApproveAction(
  kind: unknown,
  ids: unknown,
  branchSlug: string,
): Promise<ReviewActionResult> {
  const parsedKind = kindSchema.safeParse(kind);
  const parsedIds = idsSchema.safeParse(ids);
  if (!parsedKind.success || !parsedIds.success) return { error: "Geçersiz kayıt." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cashier_approve", {
    p_kind: parsedKind.data,
    p_ids: parsedIds.data,
  });
  if (error) return { error: toErrorMessage(error) };

  revalidateReview(branchSlug);
  return { count: data ?? 0 };
}

/** D-46 yönetici step: needs the kasacı first, except the kasacı's own records and the cash count. */
export async function managerApproveAction(
  kind: unknown,
  ids: unknown,
  branchSlug: string,
): Promise<ReviewActionResult> {
  const parsedKind = kindSchema.safeParse(kind);
  const parsedIds = idsSchema.safeParse(ids);
  if (!parsedKind.success || !parsedIds.success) return { error: "Geçersiz kayıt." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manager_approve", {
    p_kind: parsedKind.data,
    p_ids: parsedIds.data,
  });
  if (error) return { error: toErrorMessage(error) };

  revalidateReview(branchSlug);
  return { count: data ?? 0 };
}

/** Kasacı or yönetici "Geri gönder": back to the owner with a note (D-46). */
export async function returnItemAction(input: unknown, branchSlug: string): Promise<ReviewActionResult> {
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("return_item", {
    p_kind: parsed.data.kind,
    p_id: parsed.data.id,
    p_note: parsed.data.note,
  });
  if (error) return { error: toErrorMessage(error) };

  revalidateReview(branchSlug);
  return {};
}
