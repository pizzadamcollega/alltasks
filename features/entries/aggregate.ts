import { weekStart } from "@/lib/time";
import type { EntrySummary } from "@/features/entries/queries";

export interface WeekGroup {
  /** Monday of the week, 'YYYY-MM-DD'. */
  weekStartDate: string;
  totalMinutes: number;
  totalAmount: number;
  pendingMinutes: number;
  dayCount: number;
}

/** Groups entries (already filtered to one month) into Mon–Sun weeks, newest week first. */
export function groupEntriesByWeek(entries: EntrySummary[]): WeekGroup[] {
  interface Accumulator {
    totalMinutes: number;
    totalAmount: number;
    pendingMinutes: number;
    days: Set<string>;
  }

  const byWeek = new Map<string, Accumulator>();

  for (const entry of entries) {
    const key = weekStart(entry.workDate);
    const acc = byWeek.get(key) ?? {
      totalMinutes: 0,
      totalAmount: 0,
      pendingMinutes: 0,
      days: new Set<string>(),
    };

    acc.totalMinutes += entry.roundedMinutes ?? 0;
    acc.totalAmount += entry.amount ?? 0;
    if (entry.status === "pending") acc.pendingMinutes += entry.roundedMinutes ?? 0;
    acc.days.add(entry.workDate);

    byWeek.set(key, acc);
  }

  return [...byWeek.entries()]
    .map(([weekStartDate, acc]) => ({
      weekStartDate,
      totalMinutes: acc.totalMinutes,
      totalAmount: acc.totalAmount,
      pendingMinutes: acc.pendingMinutes,
      dayCount: acc.days.size,
    }))
    .sort((a, b) => (a.weekStartDate < b.weekStartDate ? 1 : -1));
}
