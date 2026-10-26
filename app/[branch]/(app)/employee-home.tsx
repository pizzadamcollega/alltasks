import Link from "next/link";
import { addDays, format } from "date-fns";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDayTR, formatDuration, formatTimeTR, monthStart, todayInAmsterdam, weekFromParam, weekStart, TR_MONTHS } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { getEntriesInRange, getMonthlyEarnings, getRecentEntries } from "@/features/entries/queries";
import { entryEditedNote, entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { getWeekShifts } from "@/features/shifts/queries";
import { ManualEntryForm } from "@/components/app/manual-entry-form";
import { WeekCalendar } from "@/components/app/week-calendar";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EntryRow } from "@/components/app/entry-row";
import { EmptyState } from "@/components/app/empty-state";
import type { SessionContext } from "@/lib/session";

export async function EmployeeHome({ session, hafta }: { session: SessionContext; hafta?: string }) {
  const supabase = await createClient();
  const { userId, fullName, branch } = session;

  const today = todayInAmsterdam();
  const monthStartStr = monthStart(today);
  const weekStartStr = weekStart(today);
  const weekEndStr = format(addDays(new Date(`${weekStartStr}T12:00:00Z`), 6), "yyyy-MM-dd");
  const calendarMonday = weekFromParam(hafta, today);

  const [monthly, todayEntries, weekEntries, recent, shiftDays] = await Promise.all([
    getMonthlyEarnings(supabase, userId, branch.id, monthStartStr),
    getEntriesInRange(supabase, userId, branch.id, today, today),
    getEntriesInRange(supabase, userId, branch.id, weekStartStr, weekEndStr),
    getRecentEntries(supabase, userId, branch.id, 3),
    getWeekShifts(supabase, branch.id, calendarMonday),
  ]);

  // No Başla/Bitir timer any more (D-38): every entry is typed in by hand, so
  // there is never a running shift to estimate — totals come straight from the views.
  const todayMinutes = todayEntries.reduce((sum, e) => sum + (e.roundedMinutes ?? 0), 0);
  const todayAmount = todayEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const weekMinutes = weekEntries.reduce((sum, e) => sum + (e.roundedMinutes ?? 0), 0);
  const weekAmount = weekEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  // today's programmed start pre-fills the form; only known when the board shows this week
  const todayShiftStart = shiftDays
    .find((day) => day.date === today)
    ?.shifts.find((shift) => shift.userId === userId)?.startTime;
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

      <ManualEntryForm
        branchId={branch.id}
        branchSlug={branch.slug}
        today={today}
        suggestedStart={todayShiftStart}
      />

      <WeekCalendar
        days={shiftDays}
        today={today}
        monday={calendarMonday}
        basePath={`/${branch.slug}`}
        currentUserId={userId}
      />

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
            sub={formatDuration(todayMinutes)}
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
          <EmptyState icon={History} title="Henüz kayıt yok" description="Saatlerini girince burada görünecek." />
        ) : (
          <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
            {recent.map((entry) => (
              <EntryRow
                key={entry.id}
                dateLabel={formatDayTR(entry.workDate)}
                timeRange={`${formatTimeTR(entry.startAt)} – ${entry.endAt ? formatTimeTR(entry.endAt) : "?"}`}
                duration={entry.roundedMinutes != null ? formatDuration(entry.roundedMinutes) : "Devam ediyor"}
                status={{ label: entryStatusLabel(entry.status), tone: entryStatusTone(entry.status) }}
                editedNote={entryEditedNote(entry)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
