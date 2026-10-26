"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";

export interface PaymentActionResult {
  error?: string;
}

const addPaymentSchema = z.object({
  kind: z.enum(["payment", "advance"]),
  amount: z.coerce.number().gt(0),
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(300).optional(),
  visibleToEmployee: z.boolean(),
});

/** S13 "+ Ekle" — defaults to hidden; the manager flips it visible separately. */
export async function addPaymentAction(
  userId: string,
  branchId: string,
  branchSlug: string,
  input: unknown,
): Promise<PaymentActionResult> {
  const parsed = addPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz kayıt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    user_id: userId,
    branch_id: branchId,
    kind: parsed.data.kind,
    amount: parsed.data.amount,
    month: parsed.data.month,
    paid_on: parsed.data.paidOn,
    note: parsed.data.note || null,
    visible_to_employee: parsed.data.visibleToEmployee,
  });

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/calisanlar/${userId}`);
  return {};
}

/** The switch in S13's payment list — flipping it on notifies the employee (DB trigger). */
export async function setPaymentVisibilityAction(
  paymentId: string,
  userId: string,
  branchSlug: string,
  visible: boolean,
): Promise<PaymentActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("payments")
    .update({ visible_to_employee: visible })
    .eq("id", paymentId);

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/calisanlar/${userId}`);
  return {};
}

export async function deletePaymentAction(
  paymentId: string,
  userId: string,
  branchSlug: string,
): Promise<PaymentActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/calisanlar/${userId}`);
  return {};
}
