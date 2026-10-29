import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addMonths, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext } from "@/lib/session";
import { formatDayTR, formatDuration, formatTimeTR, todayInAmsterdam, TR_MONTHS } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { remainingBalance } from "@/lib/earnings";
import { getEmployeeProfile } from "@/features/accounts/queries";
import { getMonthlyEarnings, getRecentEntries } from "@/features/entries/queries";
import { entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { getRateHistory } from "@/features/wages/queries";
import { getAllPaymentsForMonth } from "@/features/payments/queries";
import { StatusChip } from "@/components/app/status-chip";
import { EntryRow } from "@/components/app/entry-row";
import { EmptyState } from "@/components/app/empty-state";
import { History } from "lucide-react";
import { WageCard } from "./wage-card";
import { PaymentsSection } from "./payments-section";
import { AccountSection } from "./account-section";
import { DutiesCard } from "./duties-card";
import { dutyList } from "@/features/duties/labels";

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default async function CalisanProfiliPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string; id: string }>;
  searchParams: Promise<{ ay?: string }>;
}) {
  const { branch: branchSlug, id: employeeId } = await params;
  const { ay } = await searchParams;
  const session = await requireSessionContext(branchSlug);
  if (!isManager(session.role)) redirect(`/${branchSlug}`);

  const supabase = await createClient();
  const employee = await getEmployeeProfile(supabase, employeeId);
  if (!employee) notFound();
  if (employee.role === "patron") redirect(`/${branchSlug}/calisanlar/yonetici/${employeeId}`);

  const today = todayInAmsterdam();
  const currentYm = today.slice(0, 7);
  const selectedYm = ay && /^\d{4}-\d{2}$/.test(ay) ? ay : currentYm;
  const monthStartStr = `${selectedYm}-01`;
  const monthLabel = `${TR_MONTHS[Number(selectedYm.slice(5, 7)) - 1]} ${selectedYm.slice(0, 4)}`;

  const defaultEffectiveFrom = addMonths(startOfMonth(new Date(`${today}T12:00:00Z`)), 1)
    .toISOString()
    .slice(0, 10);

  const [monthly, payments, rateHistory, recentEntries] = await Promise.all([
    getMonthlyEarnings(supabase, employeeId, session.branch.id, monthStartStr),
    getAllPaymentsForMonth(supabase, employeeId, session.branch.id, monthStartStr),
    getRateHistory(supabase, employeeId),
    getRecentEntries(supabase, employeeId, session.branch.id, 10),
  ]);

  const kalan = remainingBalance({ approvedAmount: monthly.approvedAmount, payments });

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-pz-accent-soft text-lg font-bold text-pz-accent">
          {initials(employee.fullName) || "?"}
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold text-pz-text">{employee.fullName}</span>
          <span className="text-sm text-pz-muted">
            {employee.username}
            {employee.startedOn ? ` · başlangıç ${formatDayTR(employee.startedOn)}` : ""}
          </span>
          {employee.duties.length > 0 ? (
            <span className="text-sm font-medium text-pz-text">{dutyList(employee.duties)}</span>
          ) : null}
        </div>
        <StatusChip
          label={employee.active ? "Aktif" : "Pasif"}
          tone={employee.active ? "ok" : "neutral"}
          className="ml-auto"
        />
      </div>

      <section
        aria-label={`${monthLabel} özeti`}
        className="flex flex-col gap-2 rounded-card border border-pz-border bg-pz-surface p-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-pz-text">{monthLabel}</span>
          <div className="flex gap-2 text-sm font-semibold text-pz-accent">
            <Link href={`?ay=${addMonths(new Date(`${monthStartStr}T12:00:00Z`), -1).toISOString().slice(0, 7)}`}>
              ‹
            </Link>
            <Link
              href={
                selectedYm === currentYm
                  ? "#"
                  : `?ay=${addMonths(new Date(`${monthStartStr}T12:00:00Z`), 1).toISOString().slice(0, 7)}`
              }
              aria-disabled={selectedYm === currentYm}
            >
              ›
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs font-semibold text-pz-muted">Toplam saat</span>
            <div className="text-lg font-bold tabular-nums text-pz-text">
              {formatDuration(monthly.approvedMinutes + monthly.pendingMinutes)}
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold text-pz-muted">Hesaplanan</span>
            <div className="text-lg font-bold tabular-nums text-pz-text">
              {formatEUR(monthly.approvedAmount + monthly.pendingAmount)}
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold text-pz-muted">Avans</span>
            <div className="text-lg font-bold tabular-nums text-pz-text">
              {formatEUR(
                payments.filter((p) => p.kind === "advance").reduce((s, p) => s + p.amount, 0),
              )}
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold text-pz-muted">Kalan</span>
            <div className="text-lg font-bold tabular-nums text-pz-accent">{formatEUR(kalan)}</div>
          </div>
        </div>
      </section>

      <DutiesCard userId={employeeId} branchSlug={branchSlug} duties={employee.duties} />

      <WageCard
        userId={employeeId}
        branchSlug={branchSlug}
        history={rateHistory}
        defaultEffectiveFrom={defaultEffectiveFrom}
      />

      <PaymentsSection
        userId={employeeId}
        branchId={session.branch.id}
        branchSlug={branchSlug}
        month={monthStartStr}
        payments={payments}
      />

      <section aria-label="Son kayıtlar" className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-pz-text">Son kayıtlar</h2>
        {recentEntries.length === 0 ? (
          <EmptyState icon={History} title="Henüz kayıt yok" />
        ) : (
          <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
            {recentEntries.map((entry) => (
              <EntryRow
                key={entry.id}
                dateLabel={formatDayTR(entry.workDate)}
                timeRange={`${formatTimeTR(entry.startAt)} – ${entry.endAt ? formatTimeTR(entry.endAt) : "?"}`}
                duration={entry.roundedMinutes != null ? formatDuration(entry.roundedMinutes) : "Devam ediyor"}
                amount={entry.amount != null ? formatEUR(entry.amount) : undefined}
                status={{ label: entryStatusLabel(entry.status), tone: entryStatusTone(entry.status) }}
              />
            ))}
          </div>
        )}
      </section>

      <AccountSection
        userId={employeeId}
        branchSlug={branchSlug}
        active={employee.active}
        fullName={employee.fullName}
        username={employee.username}
        startedOn={employee.startedOn}
        canDelete={employeeId !== session.userId}
      />
    </div>
  );
}
