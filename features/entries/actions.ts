"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";
import { editEntrySchema, finishEntrySchema, startEntrySchema } from "@/features/entries/validation";

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

/**
 * S9 "+ Kayıt ekle": the manager adds an entry the employee forgot to clock.
 * The manager is the final reviewer, so it goes in approved (D-46).
 */
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
    status: "approved",
  });

  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/onay`);
  return {};
}

/**
 * D-46 "Mesaiye başla": opens the caller's entry with only a start time.
 * The trigger forces `user_id = auth.uid()` and the one-open-entry index
 * refuses a second running shift.
 */
export async function startEntryAction(
  branchId: string,
  branchSlug: string,
  startAt: string,
): Promise<EntryActionResult> {
  const parsed = startEntrySchema.safeParse({ startAt });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz saat." };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: "Oturum bulunamadı, tekrar giriş yap." };

  const { error } = await supabase.from("time_entries").insert({
    user_id: userId,
    branch_id: branchId,
    start_at: parsed.data.startAt.toISOString(),
  });
  if (error) {
    return { error: error.code === "23505" ? "Zaten devam eden bir mesain var." : toErrorMessage(error) };
  }

  revalidatePath(`/${branchSlug}`);
  return {};
}

/** D-46 "Mesaiyi bitir": sets the end; the trigger moves the entry to pending (kasacı onayı). */
export async function finishEntryAction(
  entryId: string,
  branchSlug: string,
  endAt: string,
): Promise<EntryActionResult> {
  const parsed = finishEntrySchema.safeParse({ endAt });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz saat." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .update({ end_at: parsed.data.endAt.toISOString() })
    .eq("id", entryId)
    .eq("status", "open")
    .select("id");
  if (error) return { error: toErrorMessage(error) };
  if (!data || data.length === 0) return { error: "Devam eden mesai bulunamadı." };

  revalidatePath(`/${branchSlug}`);
  revalidatePath(`/${branchSlug}/gecmis`);
  return {};
}

/**
 * S2 "Unuttuğun bir günü ekle": the employee types in a finished shift themselves.
 * The trigger forces `user_id = auth.uid()`, rejects future/overlapping/older
 * than 31 days entries, and sends it to the kasacı like any other (D-46, was D-37).
 */
export async function addOwnEntryAction(
  branchId: string,
  branchSlug: string,
  startAt: string,
  endAt: string,
): Promise<EntryActionResult> {
  const parsed = editEntrySchema.safeParse({ startAt, endAt });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz saat." };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: "Oturum bulunamadı, tekrar giriş yap." };

  const { error } = await supabase.from("time_entries").insert({
    user_id: userId,
    branch_id: branchId,
    start_at: parsed.data.startAt.toISOString(),
    end_at: parsed.data.endAt.toISOString(),
  });
  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}`);
  revalidatePath(`/${branchSlug}/gecmis`);
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

/** S9: bulk-approve; `approve_entries` only takes kasacı-approved ones (or the kasacı's own). */
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
