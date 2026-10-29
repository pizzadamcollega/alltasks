"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/errors";
import { createEmployeeSchema, createManagerSchema, dutiesSchema, updateAccountSchema } from "./validation";
import type { AppRole, StaffDuty } from "@/types/database";

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
  duties?: StaffDuty[];
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
  const { fullName, username, password, role, branchIds, startedOn, duties, wage } = input;

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
    duties: duties ?? [],
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

  const { fullName, username, password, hourlyRate, startedOn, duties } = parsed.data;
  const result = await createStaffAccount({
    fullName,
    username,
    password,
    role: "employee",
    branchIds,
    startedOn,
    duties,
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

/**
 * D-45 "Görevler". Runs with the caller's own session: `profiles_update` RLS
 * (manages_user) and `profiles_before_update` (no self-service, min one duty)
 * decide, not this action.
 */
export async function setDutiesAction(
  userId: string,
  branchSlug: string,
  duties: unknown,
): Promise<AccountActionResult> {
  const parsed = dutiesSchema.safeParse(duties);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz görev." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ duties: parsed.data })
    .eq("id", userId)
    .select("id");
  if (error) return { error: toErrorMessage(error) };
  if (!data || data.length === 0) return { error: "Bu işlem için yetkin yok." };

  revalidatePath(`/${branchSlug}`, "layout");
  return {};
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

/**
 * S13 "Bilgileri düzenle". full_name / started_on would pass RLS, but the
 * username is also the login e-mail and the profiles trigger only lets the
 * server change it, so the whole update runs with the admin client after the
 * `manages_user` check.
 */
export async function updateAccountAction(
  userId: string,
  branchSlug: string,
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz bilgiler." };
  }

  const domain = process.env.STAFF_EMAIL_DOMAIN;
  if (!domain) return { error: "Sunucu yapılandırması eksik." };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("manages_user", { p_user: userId });
  if (!allowed) return { error: "Bu işlem için yetkin yok." };

  const admin = createAdminClient();
  const { data: current, error: loadError } = await admin
    .from("profiles")
    .select("username, full_name")
    .eq("id", userId)
    .single();
  if (loadError || !current) return { error: toErrorMessage(loadError) };

  const { fullName, username, startedOn } = parsed.data;
  const usernameChanged = username !== current.username;

  if (usernameChanged) {
    // Auth answers a duplicate e-mail on update with a bare 500, so check first.
    const { data: taken } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (taken) return { error: "Bu kullanıcı adı zaten alınmış." };
  }

  if (usernameChanged || fullName !== current.full_name) {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      ...(usernameChanged ? { email: `${username}@${domain}` } : {}),
      user_metadata: { username, full_name: fullName },
    });
    if (authError) {
      return {
        error:
          authError.code === "email_exists" ? "Bu kullanıcı adı zaten alınmış." : toErrorMessage(authError),
      };
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, username, started_on: startedOn })
    .eq("id", userId);
  if (profileError) {
    // Keep the login e-mail and profiles.username in step.
    await admin.auth.admin.updateUserById(userId, {
      email: `${current.username}@${domain}`,
      user_metadata: { username: current.username, full_name: current.full_name },
    });
    return {
      error: profileError.code === "23505" ? "Bu kullanıcı adı zaten alınmış." : toErrorMessage(profileError),
    };
  }

  revalidatePath(`/${branchSlug}/calisanlar`, "layout");
  return {};
}

/**
 * S13 "Hesabı sil" — permanent. Deleting the auth user cascades the profile and
 * everything the user owns (entries, payments, wages, shifts); actor columns on
 * other people's rows are set to null (migration 20261027000006).
 */
export async function deleteAccountAction(
  userId: string,
  branchSlug: string,
  confirmUsername: unknown,
): Promise<AccountActionResult> {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (caller?.id === userId) return { error: "Kendi hesabını silemezsin." };

  const { data: allowed } = await supabase.rpc("manages_user", { p_user: userId });
  if (!allowed) return { error: "Bu işlem için yetkin yok." };

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("username, role")
    .eq("id", userId)
    .single();
  if (!target) return { error: "Hesap bulunamadı." };
  if (confirmUsername !== target.username) return { error: "Kullanıcı adı eşleşmiyor." };

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: toErrorMessage(error) };

  revalidatePath(`/${branchSlug}/calisanlar`, "layout");
  redirect(
    target.role === "patron" ? `/${branchSlug}/calisanlar?sekme=yoneticiler` : `/${branchSlug}/calisanlar`,
  );
}
