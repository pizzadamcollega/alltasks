import { describe, expect, it } from "vitest";
import { groupEntriesByWeek } from "@/features/entries/aggregate";
import type { EntrySummary } from "@/features/entries/queries";

function entry(partial: Partial<EntrySummary> & { workDate: string }): EntrySummary {
  return {
    id: partial.workDate,
    startAt: `${partial.workDate}T16:00:00.000Z`,
    endAt: `${partial.workDate}T20:00:00.000Z`,
    roundedMinutes: 240,
    status: "approved",
    editedByEmployee: false,
    editedByManager: false,
    manual: false,
    hourlyRate: 13,
    amount: 52,
    ...partial,
  };
}

describe("groupEntriesByWeek", () => {
  it("groups entries into Mon-Sun weeks and sums minutes/amount", () => {
    const entries: EntrySummary[] = [
      entry({ workDate: "2026-10-19" }), // week of 2026-10-19
      entry({ workDate: "2026-10-21" }),
      entry({ workDate: "2026-10-26" }), // next week
    ];

    const groups = groupEntriesByWeek(entries);

    expect(groups).toHaveLength(2);
    const [newest, oldest] = groups;
    expect(newest.weekStartDate).toBe("2026-10-26");
    expect(newest.totalMinutes).toBe(240);
    expect(newest.dayCount).toBe(1);

    expect(oldest.weekStartDate).toBe("2026-10-19");
    expect(oldest.totalMinutes).toBe(480);
    expect(oldest.totalAmount).toBe(104);
    expect(oldest.dayCount).toBe(2);
  });

  it("tracks pending minutes separately from the total", () => {
    const entries: EntrySummary[] = [
      entry({ workDate: "2026-10-19", status: "approved", roundedMinutes: 240 }),
      entry({ workDate: "2026-10-20", status: "pending", roundedMinutes: 100 }),
    ];

    const [group] = groupEntriesByWeek(entries);
    expect(group.totalMinutes).toBe(340);
    expect(group.pendingMinutes).toBe(100);
  });

  it("returns an empty array for no entries", () => {
    expect(groupEntriesByWeek([])).toEqual([]);
  });
});
