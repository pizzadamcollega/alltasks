"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";
import { editEntrySchema } from "@/features/entries/validation";

export interface EntryActionResult {
  error?: string;
}

/**
 * S2/S5: the employee corrects their own not-yet-approved entry. The schema
 * check here is a preview — `time_entries_before_write` in Postgres is the
 * real authority (e.g. it also refuses to touch an already-approved entry).
 */
export async function editOwnEntryAction(
  entryId: string,
  branchSlug: string,
  startAt: string,
  endAt: string,
): Promise<EntryActionResult> {
  const parsed = editEntrySchema.safeParse({ startAt, endAt });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz saat." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .update({
      start_at: parsed.data.startAt.toISOString(),
      end_at: parsed.data.endAt.toISOString(),
    })
    .eq("id", entryId);

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}`);
  revalidatePath(`/${branchSlug}/gecmis`);
  return {};
}

/** S9: the manager corrects any entry in their branch (including already-approved ones). */
export async function managerUpdateEntryAction(
  entryId: string,
  branchSlug: string,
  startAt: string,
  endAt: string,
): Promise<EntryActionResult> {
  const parsed = editEntrySchema.safeParse({ startAt, endAt });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz saat." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .update({
      start_at: parsed.data.startAt.toISOString(),
      end_at: parsed.data.endAt.toISOString(),
    })
    .eq("id", entryId);

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/onay`);
  return {};
}

/** S9 "+ Kayıt ekle": the manager adds an entry the employee forgot to clock. */
export async function createManualEntryAction(
  branchId: string,
  branchSlug: string,
  userId: string,
  startAt: string,
  endAt: string,
): Promise<EntryActionResult> {
  const parsed = editEntrySchema.safeParse({ startAt, endAt });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz saat." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({
    user_id: userId,
    branch_id: branchId,
    start_at: parsed.data.startAt.toISOString(),
    end_at: parsed.data.endAt.toISOString(),
  });

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/onay`);
  return {};
}

/** S9 "Sil" — delete is manager-only; the DB policy also forbids an employee from ever doing this. */
export async function deleteEntryAction(
  entryId: string,
  branchSlug: string,
): Promise<EntryActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").delete().eq("id", entryId);

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/onay`);
  return {};
}

export interface ApproveActionResult {
  error?: string;
  approvedCount?: number;
}

/** S9: bulk-approve every pending entry whose end time is set. */
export async function approveEntriesAction(
  entryIds: string[],
  branchSlug: string,
): Promise<ApproveActionResult> {
  if (entryIds.length === 0) return { approvedCount: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_entries", { p_ids: entryIds });
  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/onay`);
  return { approvedCount: data ?? 0 };
}
