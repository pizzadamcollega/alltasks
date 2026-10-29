import Link from "next/link";
import { addDays, format } from "date-fns";
import { CalendarDays, ChevronRight, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { addDaysToDate, formatDayTR, formatDuration, formatTimeTR, monthStart, todayInAmsterdam, weekFromParam, weekStart, TR_MONTHS } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { getEntriesInRange, getMonthlyEarnings, getOpenEntry, getRecentEntries, getReturnedEntries } from "@/features/entries/queries";
import { entryEditedNote, entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { getWeekPublication, getWeekRequests, getWeekShifts } from "@/features/shifts/queries";
import { ManualEntryForm } from "@/components/app/manual-entry-form";
import { ClockCard } from "@/components/app/clock-card";
import { MaterialCard } from "@/components/app/material-card";
import { getMyMaterialReport } from "@/features/materials/queries";
import { businessDay } from "@/lib/time";
import { EditableEntryRow } from "./gecmis/editable-entry-row";
import { PublishBadge, WeekCalendar } from "@/components/app/week-calendar";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EntryRow } from "@/components/app/entry-row";
import { EmptyState } from "@/components/app/empty-state";
import type { SessionContext } from "@/lib/session";

export async function EmployeeHome({ session, hafta }: { session: SessionContext; hafta?: string }) {
  const supabase = await createClient();
  const { userId, fullName, branch } = session;
  const isUsta = session.duties.includes("usta");
  const workDay = businessDay(new Date());

  const today = todayInAmsterdam();
  const monthStartStr = monthStart(today);
  const weekStartStr = weekStart(today);
  const weekEndStr = format(addDays(new Date(`${weekStartStr}T12:00:00Z`), 6), "yyyy-MM-dd");
  const calendarMonday = weekFromParam(hafta, today);
  const nextMonday = addDaysToDate(weekStartStr, 7);
  const calendarIsFuture = calendarMonday >= nextMonday;

  const [monthly, todayEntries, weekEntries, recent, shiftDays, calendarPublication, nextRequests, nextPublication, openEntry, returned] = await Promise.all([
    getMonthlyEarnings(supabase, userId, branch.id, monthStartStr),
    getEntriesInRange(supabase, userId, branch.id, today, today),
    getEntriesInRange(supabase, userId, branch.id, weekStartStr, weekEndStr),
    getRecentEntries(supabase, userId, branch.id, 3),
    getWeekShifts(supabase, branch.id, calendarMonday),
    calendarIsFuture ? getWeekPublication(supabase, branch.id, calendarMonday) : null,
    getWeekRequests(supabase, branch.id, nextMonday),
    getWeekPublication(supabase, branch.id, nextMonday),
    getOpenEntry(supabase, userId, branch.id),
    getReturnedEntries(supabase, userId, branch.id),
  ]);
  const materialReport = isUsta ? await getMyMaterialReport(supabase, userId, branch.id, workDay) : null;
  const requestSummary = nextPublication
    ? "Program yayınlandı — gör"
    : nextRequests.length === 0
      ? "Henüz istek göndermedin"
      : `${nextRequests.length} gün istedin · ${nextRequests.filter((r) => r.status === "approved").length} onaylandı`;

  // A running shift (D-46) has no end yet, so it adds nothing until "Mesaiyi bitir".
  const todayMinutes = todayEntries.reduce((sum, e) => sum + (e.roundedMinutes ?? 0), 0);
  const todayAmount = todayEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const weekMinutes = weekEntries.reduce((sum, e) => sum + (e.roundedMinutes ?? 0), 0);
  const weekAmount = weekEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  // today's programmed start pre-fills the "forgot a day" form; only known when the board shows this week
  const todayShift = shiftDays.find((day) => day.date === today)?.shifts.find((shift) => shift.userId === userId);
  const todayShiftStart = todayShift?.startTime;
  const isCashierToday = Boolean(todayShift?.isCashier && session.duties.includes("kasaci"));
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

      {isCashierToday ? (
        <Link
          href={`/${branch.slug}/kasa`}
          className="flex min-h-14 items-center gap-3 rounded-card border-2 border-pz-accent bg-pz-accent-soft px-3 py-2"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-bold text-pz-accent">Bugün kasacısın</span>
            <span className="text-[13px] text-pz-text">Saatleri, malzemeyi onayla ve kasayı say</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-pz-accent" aria-hidden />
        </Link>
      ) : null}

      {returned.length > 0 ? (
        <section aria-label="Geri gönderilen kayıtlar" className="flex flex-col gap-1">
          <h2 className="text-base font-bold text-pz-bad">Düzeltmen gereken kayıtlar</h2>
          <p className="text-[13px] text-pz-muted">Kayda dokun, saatleri düzelt ve kaydet — tekrar onaya gider.</p>
          <div className="divide-y divide-pz-border rounded-card border border-pz-bad/40 bg-pz-surface px-3">
            {returned.map((entry) => (
              <EditableEntryRow key={entry.id} entry={entry} branchSlug={branch.slug} />
            ))}
          </div>
        </section>
      ) : null}

      <ClockCard
        branchId={branch.id}
        branchSlug={branch.slug}
        openEntry={openEntry ? { id: openEntry.id, startAt: openEntry.startAt } : null}
      />

      {isUsta ? (
        <MaterialCard branchId={branch.id} branchSlug={branch.slug} workDate={workDay} report={materialReport} />
      ) : null}

      <details className="group rounded-card border border-pz-border bg-pz-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold text-pz-accent">
          Unuttuğun bir günü ekle
        </summary>
        <div className="px-1 pb-1">
          <ManualEntryForm
            branchId={branch.id}
            branchSlug={branch.slug}
            today={today}
            suggestedStart={todayShiftStart}
          />
        </div>
      </details>

      <WeekCalendar
        days={shiftDays}
        today={today}
        monday={calendarMonday}
        basePath={`/${branch.slug}`}
        currentUserId={userId}
        badge={calendarIsFuture ? <PublishBadge published={Boolean(calendarPublication)} /> : null}
        notice={
          calendarIsFuture && !calendarPublication ? (
            <p className="rounded-card border border-pz-border bg-pz-surface-2 p-4 text-sm text-pz-muted">
              Bu haftanın programı henüz yayınlanmadı.{" "}
              <Link href={`/${branch.slug}/program?hafta=${calendarMonday}`} className="font-semibold text-pz-accent">
                Gün isteği gönder
              </Link>
            </p>
          ) : null
        }
        actions={
          <Link
            href={`/${branch.slug}/program`}
            className="flex min-h-14 items-center gap-3 rounded-card border border-pz-border bg-pz-surface px-3 py-2"
          >
            <CalendarDays className="size-5 shrink-0 text-pz-accent" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-pz-text">Gelecek hafta için gün iste</span>
              <span className="text-[13px] text-pz-muted">{requestSummary}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-pz-muted" aria-hidden />
          </Link>
        }
      />

      <section aria-label="Kazanç">
        <StatGrid>
          <StatCard
            label={`${monthLabel} kazancım`}
            value={formatEUR(monthAmount)}
            sub={`${formatDuration(monthMinutes)} · ${formatEUR(monthly.approvedAmount)} onaylı · ${formatEUR(monthly.pendingAmount)} onay bekliyor`}
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
