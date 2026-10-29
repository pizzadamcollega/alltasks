import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, StaffDuty } from "@/types/database";

export interface SessionContext {
  userId: string;
  fullName: string;
  username: string;
  role: AppRole;
  /** D-45: what an employee does (kasacı / bezorgd / usta); empty for admin and patron. */
  duties: StaffDuty[];
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

  // Local JWT verification (see proxy.ts) — RLS still re-checks the token on every query.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) redirect(`/${branchSlug}/giris`);

  // Independent reads, so they go out together instead of back to back.
  const [{ data: profile }, { data: branch }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, username, role, duties, theme, active")
      .eq("id", userId)
      .single(),
    supabase.from("branches").select("id, slug, name").eq("slug", branchSlug).maybeSingle(),
  ]);

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect(`/${branchSlug}/giris?hata=pasif`);
  }

  if (!branch) {
    await supabase.auth.signOut();
    redirect(`/${branchSlug}/giris?hata=yetkisiz`);
  }

  return {
    userId,
    fullName: profile.full_name,
    username: profile.username,
    role: profile.role,
    duties: profile.duties ?? [],
    theme: profile.theme,
    branch,
  };
});

export function isManager(role: AppRole): boolean {
  return role === "patron" || role === "admin";
}

export function hasDuty(ctx: Pick<SessionContext, "duties">, duty: StaffDuty): boolean {
  return ctx.duties.includes(duty);
}
