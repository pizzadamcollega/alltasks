import { addDays, format } from "date-fns";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDayTR, formatDuration, formatTimeTR, minutesSince, monthStart, todayInAmsterdam, TR_MONTHS } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { getDailyBranchCost, getMonthlyBranchCost, getTodayStaff } from "@/features/branch/queries";
import { entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EntryRow } from "@/components/app/entry-row";
import { EmptyState } from "@/components/app/empty-state";
import type { SessionContext } from "@/lib/session";

export async function PatronHome({ session }: { session: SessionContext }) {
  const supabase = await createClient();
  const { branch } = session;

  const today = todayInAmsterdam();
  const yesterday = format(addDays(new Date(`${today}T12:00:00Z`), -1), "yyyy-MM-dd");
  const monthStartStr = monthStart(today);

  const [monthCost, yesterdayCost, staff] = await Promise.all([
    getMonthlyBranchCost(supabase, branch.id, monthStartStr),
    getDailyBranchCost(supabase, branch.id, yesterday),
    getTodayStaff(supabase, branch.id, today),
  ]);

  const monthLabel = TR_MONTHS[Number(today.slice(5, 7)) - 1];
  const workingNow = staff.filter((s) => s.status === "open").length;

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.4px] text-pz-accent">
          {branch.name}
        </span>
        <h1 className="text-[22px] font-bold text-pz-text">{formatDayTR(today)}</h1>
      </div>

      <section aria-label="Gider" className="flex flex-col gap-3">
        <StatCard
          label={`${monthLabel} personel gideri`}
          value={formatEUR(monthCost.approvedAmount)}
          sub={`${formatDuration(monthCost.approvedMinutes)} onaylı · ${monthCost.pendingRecordCount} kayıt bekliyor`}
          size="hero"
        />
        <StatGrid>
          <StatCard
            label="Dünkü gider"
            value={formatEUR(yesterdayCost.approvedAmount + yesterdayCost.pendingAmount)}
            sub={
              yesterdayCost.pendingEntries > 0
                ? `${yesterdayCost.people} kişi · ${yesterdayCost.pendingEntries} kayıt eksik`
                : `${yesterdayCost.people} kişi`
            }
          />
          <StatCard label="Bugün" value={`${workingNow} / ${staff.length}`} sub="mesaide / toplam" />
        </StatGrid>
      </section>

      <section aria-label="Bugün çalışanlar" className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-pz-text">Bugün çalışanlar</h2>
        {staff.length === 0 ? (
          <EmptyState icon={Users} title="Bugün henüz kimse mesaide değil" />
        ) : (
          <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
            {staff.map((person) => {
              const liveMinutes = person.status === "open" ? minutesSince(person.startAt) : null;
              return (
                <EntryRow
                  key={person.userId}
                  dateLabel={person.fullName}
                  timeRange={
                    person.status === "open"
                      ? `${formatTimeTR(person.startAt)}'ten beri`
                      : person.endAt
                        ? `Bitti ${formatTimeTR(person.endAt)}`
                        : "—"
                  }
                  duration={
                    person.roundedMinutes != null
                      ? formatDuration(person.roundedMinutes)
                      : liveMinutes != null
                        ? formatDuration(liveMinutes)
                        : "—"
                  }
                  status={{ label: entryStatusLabel(person.status), tone: entryStatusTone(person.status) }}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
