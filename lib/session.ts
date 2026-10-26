import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export interface SessionContext {
  userId: string;
  fullName: string;
  username: string;
  role: AppRole;
  theme: "system" | "light" | "dark";
  branch: { id: string; slug: string; name: string };
}

/**
 * Loads the signed-in user's profile and confirms they may access this
 * branch. `branches_select` RLS only returns a row for an admin or an active
 * member of that branch, so a non-member query comes back empty — that is
 * ARCHITECTURE.md's "Bu şubeye kayıtlı değilsin" case. Wrapped in React's
 * `cache()` so the layout and the page it wraps share one DB round trip.
 */
export const requireSessionContext = cache(async function requireSessionContext(
  branchSlug: string,
): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${branchSlug}/giris`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, role, theme, active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect(`/${branchSlug}/giris?hata=pasif`);
  }

  const { data: branch } = await supabase
    .from("branches")
    .select("id, slug, name")
    .eq("slug", branchSlug)
    .maybeSingle();

  if (!branch) {
    await supabase.auth.signOut();
    redirect(`/${branchSlug}/giris?hata=yetkisiz`);
  }

  return {
    userId: user.id,
    fullName: profile.full_name,
    username: profile.username,
    role: profile.role,
    theme: profile.theme,
    branch,
  };
});

export function isManager(role: AppRole): boolean {
  return role === "patron" || role === "admin";
}
