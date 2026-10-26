"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/errors";

export interface ActionResult {
  error?: string;
  success?: string;
}

const themeSchema = z.enum(["system", "light", "dark"]);

export async function updateThemeAction(theme: string): Promise<ActionResult> {
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) return { error: "Geçersiz tema." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const { error } = await supabase
    .from("profiles")
    .update({ theme: parsed.data })
    .eq("id", user.id);

  if (error) return { error: toErrorMessage(error) };
  return { success: "Kaydedildi" };
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Mevcut şifreni gir."),
  newPassword: z.string().min(8, "Yeni şifre en az 8 karakter olmalı."),
});

export async function changePasswordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz giriş." };
  }

  const domain = process.env.STAFF_EMAIL_DOMAIN;
  if (!domain) return { error: "Sunucu yapılandırması eksik." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Kullanıcı bulunamadı." };

  // Confirm the current password before changing it.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: `${profile.username}@${domain}`,
    password: parsed.data.currentPassword,
  });
  if (reauthError) return { error: "Mevcut şifre hatalı." };

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) return { error: toErrorMessage(updateError) };

  return { success: "Şifren güncellendi." };
}

export async function signOutAction(branchSlug: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${branchSlug}/giris`);
}
