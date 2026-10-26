import Link from "next/link";
import { addMonths, endOfMonth, subMonths } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { requireSessionContext } from "@/lib/session";
import {
  formatDayTR,
  formatDuration,
  todayInAmsterdam,
  TR_MONTHS,
} from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { getEntriesInRange, getMonthlyEarnings } from "@/features/entries/queries";
import { groupEntriesByWeek } from "@/features/entries/aggregate";
import { getCurrentRate } from "@/features/wages/queries";
import { getPaidMonths, getVisiblePayments } from "@/features/payments/queries";
import { remainingBalance } from "@/lib/earnings";
import { StatusChip } from "@/components/app/status-chip";
import { EmptyState } from "@/components/app/empty-state";
import { CalendarX } from "lucide-react";
import { EditableEntryRow } from "./editable-entry-row";

const TABS = [
  { value: "gunluk", label: "Günlük" },
  { value: "haftalik", label: "Haftalık" },
  { value: "aylik", label: "Aylık" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function dateToYm(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function GecmisPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ ay?: string; sekme?: string }>;
}) {
  const { branch: branchSlug } = await params;
  const { ay, sekme } = await searchParams;
  const session = await requireSessionContext(branchSlug);
  const supabase = await createClient();

  const today = todayInAmsterdam();
  const currentYm = today.slice(0, 7);
  const selectedYm = ay && /^\d{4}-\d{2}$/.test(ay) ? ay : currentYm;
  const monthDate = new Date(`${selectedYm}-01T12:00:00Z`);
  const monthStartStr = `${selectedYm}-01`;
  const monthEndStr = endOfMonth(monthDate).toISOString().slice(0, 10);
  const isCurrentMonth = selectedYm === currentYm;
  const prevYm = dateToYm(subMonths(monthDate, 1));
  const nextYm = dateToYm(addMonths(monthDate, 1));
  const tab: Tab = TABS.some((t) => t.value === sekme) ? (sekme as Tab) : "gunluk";
  const monthLabel = `${TR_MONTHS[Number(selectedYm.slice(5, 7)) - 1]} ${selectedYm.slice(0, 4)}`;

  const sixMonthStarts = Array.from({ length: 6 }, (_, i) =>
    dateToYm(subMonths(monthDate, i)) + "-01",
  );

  const [monthly, entries, currentRate, payments, sixMonthsEarnings, paidMonths] =
    await Promise.all([
      getMonthlyEarnings(supabase, session.userId, session.branch.id, monthStartStr),
      getEntriesInRange(supabase, session.userId, session.branch.id, monthStartStr, monthEndStr),
      getCurrentRate(supabase, session.userId, isCurrentMonth ? today : monthEndStr),
      getVisiblePayments(supabase, session.userId, session.branch.id, monthStartStr),
      Promise.all(
        sixMonthStarts.map((m) => getMonthlyEarnings(supabase, session.userId, session.branch.id, m)),
      ),
      getPaidMonths(supabase, session.userId, session.branch.id, sixMonthStarts),
    ]);

  const totalMinutes = monthly.approvedMinutes + monthly.pendingMinutes;
  const totalAmount = monthly.approvedAmount + monthly.pendingAmount;
  const kalan = remainingBalance({ approvedAmount: monthly.approvedAmount, payments });
  const weeks = groupEntriesByWeek(entries);

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-pz-text">Geçmiş</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`?ay=${prevYm}&sekme=${tab}`}
            aria-label="Önceki ay"
            className="flex size-11 items-center justify-center rounded-full text-lg text-pz-text hover:bg-pz-surface-2"
          >
            ‹
          </Link>
          <span className="text-sm font-semibold text-pz-text">{monthLabel}</span>
          <Link
            href={isCurrentMonth ? "#" : `?ay=${nextYm}&sekme=${tab}`}
            aria-label="Sonraki ay"
            aria-disabled={isCurrentMonth}
            className={
              isCurrentMonth
                ? "flex size-11 items-center justify-center rounded-full text-lg text-pz-muted"
                : "flex size-11 items-center justify-center rounded-full text-lg text-pz-text hover:bg-pz-surface-2"
            }
          >
            ›
          </Link>
        </div>
      </div>

      <nav
        aria-label="Görünüm"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-pz-surface-2 p-1"
      >
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`?ay=${selectedYm}&sekme=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={
              tab === t.value
                ? "flex h-11 items-center justify-center rounded-xl bg-pz-surface text-sm font-semibold text-pz-text shadow-sm"
                : "flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-pz-muted"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <section
        aria-label={`${monthLabel} özeti`}
        className="flex flex-col gap-3 rounded-card border border-pz-border bg-pz-surface p-4"
      >
        <div>
          <span className="text-[13px] font-semibold text-pz-muted">{monthLabel} toplamı</span>
          <div className="text-[32px] font-bold tabular-nums tracking-tight text-pz-text">
            {formatEUR(totalAmount)}
          </div>
          <span className="text-xs text-pz-muted">
            {formatDuration(totalMinutes)} · {monthly.approvedDays} gün
            {currentRate ? ` · ${formatEUR(currentRate)} / saat` : ""}
          </span>
        </div>
        <div className="flex gap-2">
          <StatusChip label={`Onaylı ${formatEUR(monthly.approvedAmount)}`} tone="ok" />
          <StatusChip label={`Bekleyen ${formatEUR(monthly.pendingAmount)}`} tone="warn" />
        </div>
      </section>

      {tab === "gunluk" ? (
        entries.length === 0 ? (
          <EmptyState icon={CalendarX} title="Bu ay için kayıt yok" />
        ) : (
          <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
            {entries.map((entry) => (
              <EditableEntryRow key={entry.id} entry={entry} branchSlug={branchSlug} />
            ))}
          </div>
        )
      ) : null}

      {tab === "haftalik" ? (
        weeks.length === 0 ? (
          <EmptyState icon={CalendarX} title="Bu ay için kayıt yok" />
        ) : (
          <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
            {weeks.map((week) => {
              const weekEnd = new Date(`${week.weekStartDate}T12:00:00Z`);
              weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
              return (
                <div key={week.weekStartDate} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-pz-text">
                      {formatDayTR(week.weekStartDate).split(" ").slice(1).join(" ")}–
                      {weekEnd.toISOString().slice(8, 10)}{" "}
                      {TR_MONTHS[weekEnd.getUTCMonth()]}
                    </span>
                    <span className="text-[13px] tabular-nums text-pz-muted">
                      {formatDuration(week.totalMinutes)} · {week.dayCount} gün
                    </span>
                    {week.pendingMinutes > 0 ? (
                      <span className="text-xs font-medium text-pz-warn">
                        {formatDuration(week.pendingMinutes)} bekliyor
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[15px] font-bold tabular-nums text-pz-text">
                    {formatEUR(week.totalAmount)}
                  </span>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "aylik" ? (
        <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
          {sixMonthStarts.map((monthKey, i) => {
            const m = sixMonthsEarnings[i];
            const label = `${TR_MONTHS[Number(monthKey.slice(5, 7)) - 1]} ${monthKey.slice(0, 4)}`;
            const amount = m.approvedAmount + m.pendingAmount;
            const minutes = m.approvedMinutes + m.pendingMinutes;
            const note =
              monthKey === `${currentYm}-01`
                ? "Ay devam ediyor"
                : paidMonths.has(monthKey)
                  ? "Ödendi"
                  : undefined;
            return (
              <div key={monthKey} className="flex items-start justify-between gap-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-pz-text">{label}</span>
                  <span className="text-[13px] tabular-nums text-pz-muted">
                    {formatDuration(minutes)} · {m.approvedDays} gün
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[15px] font-bold tabular-nums text-pz-text">
                    {formatEUR(amount)}
                  </span>
                  {note ? <span className="text-xs text-pz-muted">{note}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {payments.length > 0 ? (
        <section
          aria-label="Ödemeler"
          className="flex flex-col gap-2 rounded-card border border-pz-border bg-pz-surface p-4"
        >
          <h2 className="text-base font-bold text-pz-text">Ödemeler</h2>
          <p className="text-xs text-pz-muted">Patronunun seninle paylaştığı ödeme bilgileri.</p>
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex justify-between text-sm">
              <span className="text-pz-muted">Hesaplanan ücret</span>
              <span className="font-semibold tabular-nums text-pz-text">
                {formatEUR(monthly.approvedAmount)}
              </span>
            </div>
            {payments.map((payment) => (
              <div key={payment.id} className="flex justify-between text-sm">
                <span className="text-pz-muted">
                  {payment.kind === "advance" ? "Avans" : "Ödeme"} · {payment.paidOn}
                </span>
                <span className="font-semibold tabular-nums text-pz-text">
                  {formatEUR(-payment.amount)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-pz-border pt-1.5 text-[15px] font-bold">
              <span className="text-pz-text">Kalan</span>
              <span className="tabular-nums text-pz-text">{formatEUR(kalan)}</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
