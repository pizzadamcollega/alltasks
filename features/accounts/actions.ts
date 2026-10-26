"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/errors";
import { usernameSchema } from "@/lib/validation/username";

export interface AccountActionResult {
  error?: string;
}

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  username: usernameSchema,
  password: z.string().min(8),
  hourlyRate: z.coerce.number().gt(0).lt(1000),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * S14 Yeni çalışan. Every admin-client call here follows CLAUDE.md golden
 * rule 2: check the caller's own rights with their own session first
 * (`rpc('is_branch_manager')`), only then touch the service-role client —
 * and roll back the auth user if any follow-up write fails.
 */
export async function createEmployeeAction(
  branchId: string,
  branchSlug: string,
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = createEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }

  const domain = process.env.STAFF_EMAIL_DOMAIN;
  if (!domain) return { error: "Sunucu yapılandırması eksik." };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("is_branch_manager", { branch: branchId });
  if (!allowed) return { error: "Bu işlem için yetkin yok." };

  const {
    data: { user: manager },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { fullName, username, password, hourlyRate, startedOn } = parsed.data;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `${username}@${domain}`,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (createError || !created.user) {
    const message =
      createError?.message === "User already registered"
        ? "Bu kullanıcı adı zaten alınmış."
        : toErrorMessage(createError);
    return { error: message };
  }

  const userId = created.user.id;
  const rollback = () => admin.auth.admin.deleteUser(userId);

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name: fullName,
    username,
    role: "employee",
    started_on: startedOn,
  });
  if (profileError) {
    await rollback();
    return { error: "Hesap oluşturulamadı, geri alındı." };
  }

  const { error: memberError } = await admin
    .from("branch_members")
    .insert({ user_id: userId, branch_id: branchId });
  if (memberError) {
    await rollback();
    return { error: "Hesap oluşturulamadı, geri alındı." };
  }

  const { error: wageError } = await admin.from("wage_rates").insert({
    user_id: userId,
    hourly_rate: hourlyRate,
    effective_from: startedOn,
    created_by: manager?.id ?? null,
  });
  if (wageError) {
    await rollback();
    return { error: "Hesap oluşturulamadı, geri alındı." };
  }

  revalidatePath(`/${branchSlug}/calisanlar`);
  redirect(`/${branchSlug}/calisanlar/${userId}`);
}

const newPasswordSchema = z.string().min(8, "Şifre en az 8 karakter olmalı.");

/** S13 "Şifreyi sıfırla". */
export async function resetPasswordAction(
  userId: string,
  branchSlug: string,
  newPassword: unknown,
): Promise<AccountActionResult> {
  const parsed = newPasswordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz şifre." };
  }

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("manages_user", { user: userId });
  if (!allowed) return { error: "Bu işlem için yetkin yok." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: parsed.data });
  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/calisanlar/${userId}`);
  return {};
}

/** S13 "Hesabı pasife al" / "Aktifleştir" — bans in Supabase Auth, flips `profiles.active`. */
export async function setActiveAction(
  userId: string,
  branchSlug: string,
  active: boolean,
): Promise<AccountActionResult> {
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("manages_user", { user: userId });
  if (!allowed) return { error: "Bu işlem için yetkin yok." };

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) return { error: toErrorMessage(banError) };

  const { error: profileError } = await admin.from("profiles").update({ active }).eq("id", userId);
  if (profileError) return { error: toErrorMessage(profileError) };

  revalidatePath(`/${branchSlug}/calisanlar/${userId}`);
  revalidatePath(`/${branchSlug}/calisanlar`);
  return {};
}
