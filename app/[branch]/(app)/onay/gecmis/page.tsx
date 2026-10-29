import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext } from "@/lib/session";
import { formatDayTR } from "@/lib/time";
import { getClosedDays } from "@/features/day-close/queries";
import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";

/** D-49 Kapatılan günler — every saved day summary, newest first. */
export default async function KapatilanGunlerPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch: branchSlug } = await params;
  const session = await requireSessionContext(branchSlug);
  if (!isManager(session.role)) redirect(`/${branchSlug}`);

  const supabase = await createClient();
  const days = await getClosedDays(supabase, session.branch.id);

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <Link href={`/${branchSlug}/onay`} className="flex h-11 items-center text-sm font-semibold text-pz-accent">
        ‹ Gün sonu onayı
      </Link>
      <h1 className="text-[22px] font-bold text-pz-text">Kapatılan günler</h1>
      {days.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Henüz kapatılan gün yok" />
      ) : (
        <ul className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
          {days.map((d) => (
            <li key={d.workDate}>
              <Link
                href={`/${branchSlug}/onay/ozet?gun=${d.workDate}`}
                className="flex min-h-14 items-center justify-between gap-3 py-2"
              >
                <span className="text-sm font-semibold text-pz-text">{formatDayTR(d.workDate, true)}</span>
                <span className="flex items-center gap-2">
                  <StatusChip label={d.closed ? "Kapalı" : "Düzenleniyor"} tone={d.closed ? "ok" : "warn"} />
                  <ChevronRight className="size-5 text-pz-muted" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
