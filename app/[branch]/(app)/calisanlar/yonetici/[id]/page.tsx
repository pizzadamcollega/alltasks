import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSessionContext } from "@/lib/session";
import { formatDayTR } from "@/lib/time";
import { getEmployeeProfile, getManagerList } from "@/features/accounts/queries";
import { StatusChip } from "@/components/app/status-chip";
import { AccountSection } from "../../[id]/account-section";

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Admin-only yönetici profile: identity + branch + the shared Hesap card (şifre / pasife al). */
export default async function YoneticiProfiliPage({
  params,
}: {
  params: Promise<{ branch: string; id: string }>;
}) {
  const { branch: branchSlug, id: managerId } = await params;
  const session = await requireSessionContext(branchSlug);
  if (session.role !== "admin") redirect(`/${branchSlug}`);

  const supabase = await createClient();
  const [manager, managers] = await Promise.all([
    getEmployeeProfile(supabase, managerId),
    getManagerList(supabase),
  ]);
  if (!manager || manager.role !== "patron") notFound();
  const branchNames = managers.find((m) => m.userId === managerId)?.branchNames ?? [];

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-pz-accent-soft text-lg font-bold text-pz-accent">
          {initials(manager.fullName) || "?"}
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold text-pz-text">{manager.fullName}</span>
          <span className="text-sm text-pz-muted">
            {manager.username} · Yönetici
            {manager.startedOn ? ` · başlangıç ${formatDayTR(manager.startedOn)}` : ""}
          </span>
        </div>
        <StatusChip
          label={manager.active ? "Aktif" : "Pasif"}
          tone={manager.active ? "ok" : "neutral"}
          className="ml-auto"
        />
      </div>

      <section
        aria-label="Şube"
        className="flex flex-col gap-1 rounded-card border border-pz-border bg-pz-surface p-4"
      >
        <span className="text-xs font-semibold text-pz-muted">Şube</span>
        <span className="text-sm font-semibold text-pz-text">
          {branchNames.length > 0 ? branchNames.join(", ") : "Şube atanmamış"}
        </span>
      </section>

      <AccountSection userId={managerId} branchSlug={branchSlug} active={manager.active} />
    </div>
  );
}
