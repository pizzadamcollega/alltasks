"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface SignInResult {
  error?: string;
}

const signInSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  branch: z.string().min(1),
});

/**
 * Staff have no real e-mail (docs/ARCHITECTURE.md §4), so Supabase Auth sees
 * `<username>@<STAFF_EMAIL_DOMAIN>`. Failures always get the same generic
 * Turkish message, regardless of whether the username exists.
 */
export async function signInAction(
  _previous: SignInResult,
  formData: FormData,
): Promise<SignInResult> {
  const parsed = signInSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    branch: formData.get("branch"),
  });

  if (!parsed.success) {
    return { error: "Kullanıcı adı ve şifre gerekli." };
  }

  const domain = process.env.STAFF_EMAIL_DOMAIN;
  if (!domain) {
    return { error: "Sunucu yapılandırması eksik. Yönetime bildir." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: `${parsed.data.username.toLowerCase()}@${domain}`,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Kullanıcı adı veya şifre hatalı." };
  }

  redirect(`/${parsed.data.branch}`);
}
