import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TZDate } from "@date-fns/tz";
import {
  TZ,
  amsterdamLocalToISO,
  businessDay,
  formatDayTR,
  formatDuration,
  formatTimeTR,
  isoToAmsterdamLocalInput,
  manualEntryRange,
  minutesSince,
  monthStart,
  requestDeadline,
  roundMinutes,
  weekDates,
  weekStart,
} from "@/lib/time";

describe("roundMinutes", () => {
  it("rounds to the nearest 5 minutes, exact halves rounding up", () => {
    const start = new Date("2026-10-24T20:00:00Z");
    const plusSeconds = (sec: number) => new Date(start.getTime() + sec * 1000);

    expect(roundMinutes(start, plusSeconds(7 * 60))).toBe(5);
    expect(roundMinutes(start, plusSeconds(8 * 60))).toBe(10);
    expect(roundMinutes(start, plusSeconds(7 * 60 + 30))).toBe(10);
    expect(roundMinutes(start, plusSeconds(3 * 3600 + 2 * 60))).toBe(180);
    expect(roundMinutes(start, plusSeconds(2 * 3600 + 32 * 60 + 30))).toBe(155);
  });

  it("returns null for an open entry", () => {
    expect(roundMinutes(new Date(), null)).toBeNull();
  });
});

describe("businessDay", () => {
  it("keeps shifts starting at or after the cutoff on the same day", () => {
    const start = new TZDate(2026, 9, 24, 17, 0, 0, TZ);
    expect(businessDay(start)).toBe("2026-10-24");

    const atCutoff = new TZDate(2026, 9, 25, 6, 0, 0, TZ);
    expect(businessDay(atCutoff)).toBe("2026-10-25");
  });

  it("moves shifts starting before the cutoff to the previous day", () => {
    const afterMidnight = new TZDate(2026, 9, 25, 0, 30, 0, TZ);
    expect(businessDay(afterMidnight)).toBe("2026-10-24");

    const justBeforeCutoff = new TZDate(2026, 9, 25, 5, 59, 0, TZ);
    expect(businessDay(justBeforeCutoff)).toBe("2026-10-24");
  });

  it("handles the DST fall-back night (last Sunday of October)", () => {
    const start = new TZDate(2026, 9, 24, 17, 0, 0, TZ);
    const end = new TZDate(2026, 9, 25, 3, 0, 0, TZ);
    expect(roundMinutes(start, end)).toBe(660);
  });

  it("handles the DST spring-forward night (last Sunday of March)", () => {
    const start = new TZDate(2027, 2, 27, 17, 0, 0, TZ);
    const end = new TZDate(2027, 2, 28, 3, 0, 0, TZ);
    expect(roundMinutes(start, end)).toBe(540);
  });
});

describe("weekStart", () => {
  it("returns the Monday of the ISO week", () => {
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
  });
});

describe("requestDeadline", () => {
  it("is the given weekday/time in the week before the schedule week", () => {
    const deadline = requestDeadline("2026-11-02", 4, "23:59");
    const local = new TZDate(deadline, TZ);
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(9); // October
    expect(local.getDate()).toBe(29);
    expect(local.getHours()).toBe(23);
    expect(local.getMinutes()).toBe(59);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes in Turkish", () => {
    expect(formatDuration(515)).toBe("8 sa 35 dk");
    expect(formatDuration(40)).toBe("40 dk");
    expect(formatDuration(420)).toBe("7 sa 00 dk");
  });
});

describe("amsterdamLocalToISO / isoToAmsterdamLocalInput", () => {
  it("round-trips a winter (CET) local datetime", () => {
    const iso = amsterdamLocalToISO("2026-01-15T16:55");
    expect(isoToAmsterdamLocalInput(iso)).toBe("2026-01-15T16:55");
  });

  it("round-trips a summer (CEST) local datetime", () => {
    const iso = amsterdamLocalToISO("2026-07-15T23:05");
    expect(isoToAmsterdamLocalInput(iso)).toBe("2026-07-15T23:05");
  });

  it("produces the correct UTC instant in winter (UTC+1)", () => {
    expect(amsterdamLocalToISO("2026-01-15T16:55")).toBe("2026-01-15T15:55:00.000Z");
  });
});

describe("minutesSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T20:15:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns whole elapsed minutes since the given timestamp", () => {
    expect(minutesSince("2026-10-24T20:00:00.000Z")).toBe(15);
  });
});

describe("formatTimeTR", () => {
  it("formats an ISO timestamp as Amsterdam local HH:mm", () => {
    const winterUtc = new TZDate(2026, 0, 15, 16, 55, 0, TZ).toISOString();
    expect(formatTimeTR(winterUtc)).toBe("16:55");
  });
});

describe("monthStart", () => {
  it("returns the 1st of the month", () => {
    expect(monthStart("2026-10-24")).toBe("2026-10-01");
  });
});

describe("formatDayTR", () => {
  it("formats a calendar date as a Turkish weekday + day + month", () => {
    expect(formatDayTR("2026-10-24")).toBe("Cumartesi 24 Ekim");
    expect(formatDayTR("2026-10-25")).toBe("Pazar 25 Ekim");
  });
});

describe("manualEntryRange", () => {
  it("keeps a same-day shift on the given date (CET, UTC+1)", () => {
    expect(manualEntryRange("2026-10-26", "16:45", "23:15")).toEqual({
      startAt: "2026-10-26T15:45:00.000Z",
      endAt: "2026-10-26T22:15:00.000Z",
    });
  });

  it("rolls an end time before the start over to the next day", () => {
    expect(manualEntryRange("2026-10-26", "17:00", "01:30")).toEqual({
      startAt: "2026-10-26T16:00:00.000Z",
      endAt: "2026-10-27T00:30:00.000Z",
    });
  });

  it("uses summer time before the DST switch night (25 Oct 2026, CEST)", () => {
    expect(manualEntryRange("2026-10-24", "18:00", "01:00")).toEqual({
      startAt: "2026-10-24T16:00:00.000Z",
      endAt: "2026-10-24T23:00:00.000Z",
    });
  });
});

describe("weekDates", () => {
  it("lists Monday..Sunday across a month boundary", () => {
    expect(weekDates("2026-10-26")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });
});
