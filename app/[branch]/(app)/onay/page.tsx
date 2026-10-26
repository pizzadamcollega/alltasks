import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, format } from "date-fns";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext } from "@/lib/session";
import { formatDayTR, formatDuration, todayInAmsterdam } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { getBranchDayEntries } from "@/features/entries/queries";
import { getBranchEmployees } from "@/features/branch/queries";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { ApprovalCard } from "@/components/app/approval-card";
import { EmptyState } from "@/components/app/empty-state";
import { ApproveAllButton } from "./approve-all-button";
import { AddEntryForm } from "./add-entry-form";

export default async function OnayPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ gun?: string }>;
}) {
  const { branch: branchSlug } = await params;
  const { gun } = await searchParams;
  const session = await requireSessionContext(branchSlug);
  if (!isManager(session.role)) redirect(`/${branchSlug}`);

  const supabase = await createClient();
  const today = todayInAmsterdam();
  const yesterday = format(addDays(new Date(`${today}T12:00:00Z`), -1), "yyyy-MM-dd");
  const day = gun && /^\d{4}-\d{2}-\d{2}$/.test(gun) ? gun : yesterday;
  const isToday = day === today;
  const prevDay = format(addDays(new Date(`${day}T12:00:00Z`), -1), "yyyy-MM-dd");
  const nextDay = format(addDays(new Date(`${day}T12:00:00Z`), 1), "yyyy-MM-dd");

  const [entries, employees] = await Promise.all([
    getBranchDayEntries(supabase, session.branch.id, day),
    getBranchEmployees(supabase, session.branch.id),
  ]);

  const approvedCount = entries.filter((e) => e.status === "approved").length;
  const totalMinutes = entries.reduce((sum, e) => sum + (e.roundedMinutes ?? 0), 0);
  const totalCost = entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const approvableIds = entries
    .filter((e) => e.status === "pending" && e.endAt !== null)
    .map((e) => e.id);

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-pz-text">Gün sonu onayı</h1>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Link
          href={`?gun=${prevDay}`}
          aria-label="Önceki gün"
          className="flex size-11 items-center justify-center rounded-full text-pz-text hover:bg-pz-surface-2"
        >
          ‹
        </Link>
        <span className="min-w-[180px] rounded-chip bg-pz-surface-2 px-4 py-2 text-center text-sm font-semibold text-pz-text">
          {formatDayTR(day)}
        </span>
        <Link
          href={isToday ? "#" : `?gun=${nextDay}`}
          aria-label="Sonraki gün"
          aria-disabled={isToday}
          className={
            isToday
              ? "flex size-11 items-center justify-center rounded-full text-pz-muted"
              : "flex size-11 items-center justify-center rounded-full text-pz-text hover:bg-pz-surface-2"
          }
        >
          ›
        </Link>
      </div>

      <section aria-label="Günün özeti">
        <StatGrid>
          <StatCard label="Onaylanan" value={`${approvedCount} / ${entries.length}`} />
          <StatCard label="Toplam saat" value={formatDuration(totalMinutes)} />
          <StatCard label="Gider" value={formatEUR(totalCost)} span2 />
        </StatGrid>
        <p className="pt-2 text-xs text-pz-muted">
          Toplamlara bitirilmemiş kayıt dahil değil. Süreler 5 dakikaya yuvarlandı.
        </p>
      </section>

      <div className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Bu gün için kayıt yok" />
        ) : (
          entries.map((entry) => (
            <ApprovalCard key={entry.id} entry={entry} branchSlug={branchSlug} />
          ))
        )}
      </div>

      <AddEntryForm
        branchId={session.branch.id}
        branchSlug={branchSlug}
        employees={employees}
        day={day}
        today={today}
      />

      <ApproveAllButton entryIds={approvableIds} branchSlug={branchSlug} />
    </div>
  );
}
