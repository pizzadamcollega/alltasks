"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/errors";
import { createEmployeeSchema, createManagerSchema } from "./validation";
import type { AppRole } from "@/types/database";

export interface AccountActionResult {
  error?: string;
}

interface StaffAccountInput {
  fullName: string;
  username: string;
  password: string;
  role: AppRole;
  branchIds: string[];
  startedOn?: string;
  wage?: { hourlyRate: number; createdBy: string | null };
}

/**
 * Auth user → profile → memberships → optional first wage, with the auth user
 * deleted again if any follow-up write fails. Only call this AFTER the
 * caller's rights were checked with their own session (CLAUDE.md golden rule 2).
 */
async function createStaffAccount(
  input: StaffAccountInput,
): Promise<{ userId: string } | { error: string }> {
  const domain = process.env.STAFF_EMAIL_DOMAIN;
  if (!domain) return { error: "Sunucu yapılandırması eksik." };

  const admin = createAdminClient();
  const { fullName, username, password, role, branchIds, startedOn, wage } = input;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `${username}@${domain}`,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (createError || !created.user) {
    const message =
      createError?.code === "email_exists" || createError?.message === "User already registered"
        ? "Bu kullanıcı adı zaten alınmış."
        : toErrorMessage(createError);
    return { error: message };
  }

  const userId = created.user.id;
  const rolledBack = async () => {
    await admin.auth.admin.deleteUser(userId);
    return { error: "Hesap oluşturulamadı, geri alındı." };
  };

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name: fullName,
    username,
    role,
    started_on: startedOn ?? null,
  });
  if (profileError) return rolledBack();

  const { error: memberError } = await admin
    .from("branch_members")
    .insert(branchIds.map((branchId) => ({ user_id: userId, branch_id: branchId })));
  if (memberError) return rolledBack();

  if (wage) {
    const { error: wageError } = await admin.from("wage_rates").insert({
      user_id: userId,
      hourly_rate: wage.hourlyRate,
      effective_from: startedOn!,
      created_by: wage.createdBy,
    });
    if (wageError) return rolledBack();
  }

  return { userId };
}

/**
 * S14 Yeni çalışan. The caller must manage **every** selected branch
 * (`is_branch_manager` per branch) — a patron's form only ever sends their own.
 */
export async function createEmployeeAction(
  branchSlug: string,
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = createEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }

  const supabase = await createClient();
  const { branchIds } = parsed.data;
  const checks = await Promise.all(
    branchIds.map((branchId) => supabase.rpc("is_branch_manager", { p_branch: branchId })),
  );
  if (checks.some(({ data }) => !data)) return { error: "Bu işlem için yetkin yok." };

  const {
    data: { user: manager },
  } = await supabase.auth.getUser();

  const { fullName, username, password, hourlyRate, startedOn } = parsed.data;
  const result = await createStaffAccount({
    fullName,
    username,
    password,
    role: "employee",
    branchIds,
    startedOn,
    wage: { hourlyRate, createdBy: manager?.id ?? null },
  });
  if ("error" in result) return result;

  revalidatePath(`/${branchSlug}/calisanlar`);
  redirect(`/${branchSlug}/calisanlar/${result.userId}`);
}

/** Admin-only "Yeni yönetici": a patron account bound to exactly one branch, no wage. */
export async function createManagerAction(
  branchSlug: string,
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = createManagerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { error: "Bu işlem için yetkin yok." };

  const { fullName, username, password, branchId } = parsed.data;
  const result = await createStaffAccount({
    fullName,
    username,
    password,
    role: "patron",
    branchIds: [branchId],
  });
  if ("error" in result) return result;

  revalidatePath(`/${branchSlug}/calisanlar`);
  redirect(`/${branchSlug}/calisanlar?sekme=yoneticiler`);
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
  const { data: allowed } = await supabase.rpc("manages_user", { p_user: userId });
  if (!allowed) return { error: "Bu işlem için yetkin yok." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: parsed.data });
  if (error) return { error: toErrorMessage(error) };

  // "layout" also covers the yönetici detail page under calisanlar/yonetici/[id].
  revalidatePath(`/${branchSlug}/calisanlar`, "layout");
  return {};
}

/** S13 "Hesabı pasife al" / "Aktifleştir" — bans in Supabase Auth, flips `profiles.active`. */
export async function setActiveAction(
  userId: string,
  branchSlug: string,
  active: boolean,
): Promise<AccountActionResult> {
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("manages_user", { p_user: userId });
  if (!allowed) return { error: "Bu işlem için yetkin yok." };

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) return { error: toErrorMessage(banError) };

  const { error: profileError } = await admin.from("profiles").update({ active }).eq("id", userId);
  if (profileError) return { error: toErrorMessage(profileError) };

  revalidatePath(`/${branchSlug}/calisanlar`, "layout");
  return {};
}
