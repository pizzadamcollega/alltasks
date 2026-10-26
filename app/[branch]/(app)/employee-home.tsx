import Link from "next/link";
import { addDays, format } from "date-fns";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDayTR, formatDuration, formatTimeTR, minutesSince, monthStart, todayInAmsterdam, weekStart, TR_MONTHS } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { getOpenEntry } from "@/features/clock/queries";
import { getEntriesInRange, getMonthlyEarnings, getRecentEntries } from "@/features/entries/queries";
import { entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { getCurrentRate } from "@/features/wages/queries";
import { ClockCard, type ClockState } from "@/components/app/clock-card";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EntryRow } from "@/components/app/entry-row";
import { EmptyState } from "@/components/app/empty-state";
import type { SessionContext } from "@/lib/session";

export async function EmployeeHome({ session }: { session: SessionContext }) {
  const supabase = await createClient();
  const { userId, fullName, branch } = session;

  const today = todayInAmsterdam();
  const monthStartStr = monthStart(today);
  const weekStartStr = weekStart(today);
  const weekEndStr = format(addDays(new Date(`${weekStartStr}T12:00:00Z`), 6), "yyyy-MM-dd");

  const [openEntry, monthly, todayEntries, weekEntries, recent, currentRate] = await Promise.all([
    getOpenEntry(supabase, userId),
    getMonthlyEarnings(supabase, userId, branch.id, monthStartStr),
    getEntriesInRange(supabase, userId, branch.id, today, today),
    getEntriesInRange(supabase, userId, branch.id, weekStartStr, weekEndStr),
    getRecentEntries(supabase, userId, branch.id, 3),
    getCurrentRate(supabase, userId, today),
  ]);

  const clockState: ClockState = !openEntry
    ? { kind: "idle" }
    : openEntry.branchId === branch.id
      ? { kind: "running", startAt: openEntry.startAt }
      : { kind: "otherBranch" };

  // Closed entries come from the DB views; a still-running shift is estimated
  // live from the clock-in time and today's hourly rate (SCREENS.md S2 "Bugün · tahmini").
  let liveMinutes = 0;
  let liveAmount = 0;
  if (clockState.kind === "running" && currentRate) {
    liveMinutes = minutesSince(clockState.startAt);
    liveAmount = (liveMinutes / 60) * currentRate;
  }

  const todayMinutes = todayEntries.reduce((sum, e) => sum + (e.roundedMinutes ?? 0), 0) + liveMinutes;
  const todayAmount = todayEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0) + liveAmount;
  const weekMinutes = weekEntries.reduce((sum, e) => sum + (e.roundedMinutes ?? 0), 0) + liveMinutes;
  const weekAmount = weekEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0) + liveAmount;
  const monthMinutes = monthly.approvedMinutes + monthly.pendingMinutes;
  const monthAmount = monthly.approvedAmount + monthly.pendingAmount;
  const monthLabel = TR_MONTHS[Number(today.slice(5, 7)) - 1];
  const firstName = fullName.split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div>
        <h1 className="text-[22px] font-bold text-pz-text">Merhaba, {firstName}</h1>
        <p className="text-sm text-pz-muted">{formatDayTR(today)}</p>
      </div>

      <ClockCard branchId={branch.id} branchSlug={branch.slug} state={clockState} />

      <section aria-label="Kazanç">
        <StatGrid>
          <StatCard
            label={`${monthLabel} kazancım`}
            value={formatEUR(monthAmount)}
            sub={`${formatDuration(monthMinutes)} · ${formatEUR(monthly.pendingAmount)} onay bekliyor`}
            size="hero"
            span2
          />
          <StatCard
            label="Bugün"
            value={formatEUR(todayAmount)}
            sub={clockState.kind === "running" ? `${formatDuration(todayMinutes)} · tahmini` : formatDuration(todayMinutes)}
          />
          <StatCard label="Bu hafta" value={formatEUR(weekAmount)} sub={formatDuration(weekMinutes)} />
        </StatGrid>
      </section>

      <section aria-label="Son kayıtlar" className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-pz-text">Son kayıtlar</h2>
          <Link href={`/${branch.slug}/gecmis`} className="text-sm font-semibold text-pz-accent">
            Tümü
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon={History} title="Henüz kayıt yok" description="Başla'ya basınca burada görünecek." />
        ) : (
          <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
            {recent.map((entry) => (
              <EntryRow
                key={entry.id}
                dateLabel={formatDayTR(entry.workDate)}
                timeRange={`${formatTimeTR(entry.startAt)} – ${entry.endAt ? formatTimeTR(entry.endAt) : "?"}`}
                duration={entry.roundedMinutes != null ? formatDuration(entry.roundedMinutes) : "Devam ediyor"}
                status={{ label: entryStatusLabel(entry.status), tone: entryStatusTone(entry.status) }}
                editedNote={entry.editedByEmployee ? "Düzenlendi" : entry.editedByManager ? "Patron düzenledi" : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
