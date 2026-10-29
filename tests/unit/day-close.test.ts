import { describe, expect, it } from "vitest";
import { cashCountSchema, cashTotal, parseEuroInput } from "@/features/cash/validation";
import { materialReportSchema } from "@/features/materials/validation";
import { formatDough } from "@/features/materials/queries";
import { entryStatusLabel, entryStatusTone, isEntryEditableByOwner } from "@/features/entries/status";
import { endTimeToISO, nowTimeAmsterdam, startTimeToISO } from "@/lib/time";

describe("parseEuroInput", () => {
  it("reads comma and dot decimals and tr/nl grouping", () => {
    expect(parseEuroInput("125,50")).toBe(125.5);
    expect(parseEuroInput("125.5")).toBe(125.5);
    expect(parseEuroInput("1.234,56")).toBe(1234.56);
    expect(parseEuroInput("")).toBe(0);
  });

  it("rejects junk, negatives and more than two decimals", () => {
    expect(parseEuroInput("abc")).toBeNaN();
    expect(parseEuroInput("-5")).toBeNaN();
    expect(parseEuroInput("1,234")).toBeNaN();
  });
});

describe("cashTotal", () => {
  it("adds online + kiosk + contant in cents (no float drift)", () => {
    expect(cashTotal({ online: 0.1, kiosk: 0.2, contant: 0 })).toBe(0.3);
    expect(cashTotal({ online: 812.5, kiosk: 100.25, contant: 50 })).toBe(962.75);
  });
});

describe("cashCountSchema", () => {
  it("accepts typed amounts and an empty note", () => {
    const parsed = cashCountSchema.safeParse({
      workDate: "2026-10-29",
      openingFloat: "150",
      online: "812,50",
      kiosk: "",
      contant: "99.95",
      note: " ",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ openingFloat: 150, online: 812.5, kiosk: 0, contant: 99.95, note: null });
  });

  it("rejects an unreadable amount", () => {
    const parsed = cashCountSchema.safeParse({
      workDate: "2026-10-29",
      openingFloat: "0",
      online: "veel",
      kiosk: "0",
      contant: "0",
      note: "",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("materialReportSchema", () => {
  it("takes signed whole numbers per dough size", () => {
    const parsed = materialReportSchema.safeParse({ workDate: "2026-10-29", doughS: "-5", doughM: 3, doughL: 0, note: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ doughS: -5, doughM: 3, doughL: 0, note: null });
  });

  it("rejects fractions and out-of-range values", () => {
    expect(materialReportSchema.safeParse({ workDate: "2026-10-29", doughS: 1.5, doughM: 0, doughL: 0, note: "" }).success).toBe(false);
    expect(materialReportSchema.safeParse({ workDate: "2026-10-29", doughS: 1000, doughM: 0, doughL: 0, note: "" }).success).toBe(false);
  });

  it("formats with an explicit sign", () => {
    expect(formatDough(3)).toBe("+3");
    expect(formatDough(-5)).toBe("−5");
    expect(formatDough(0)).toBe("0");
  });
});

describe("entry review statuses (D-46)", () => {
  it("labels every step in text, not colour alone", () => {
    expect(entryStatusLabel("cashier_approved")).toBe("Kasacı onayladı");
    expect(entryStatusLabel("returned")).toBe("Geri gönderildi");
    expect(entryStatusTone("approved")).toBe("ok");
    expect(entryStatusTone("returned")).toBe("bad");
  });

  it("lets the owner edit only before any reviewer signed off", () => {
    expect(isEntryEditableByOwner("pending")).toBe(true);
    expect(isEntryEditableByOwner("returned")).toBe(true);
    expect(isEntryEditableByOwner("cashier_approved")).toBe(false);
    expect(isEntryEditableByOwner("approved")).toBe(false);
  });
});

describe("clock times (D-46)", () => {
  // 2026-10-29 18:07 in Amsterdam (CET, UTC+1)
  const now = new Date("2026-10-29T17:07:00Z");

  it("floors now to the 5-minute grid", () => {
    expect(nowTimeAmsterdam(now)).toBe("18:05");
  });

  it("starts today, or last night when the time is still ahead", () => {
    expect(startTimeToISO("16:45", now)).toBe("2026-10-29T15:45:00.000Z");
    expect(startTimeToISO("23:50", new Date("2026-10-29T23:05:00Z"))).toBe("2026-10-29T22:50:00.000Z");
  });

  it("ends after the start, rolling past midnight", () => {
    expect(endTimeToISO("2026-10-29T15:45:00.000Z", "23:00")).toBe("2026-10-29T22:00:00.000Z");
    expect(endTimeToISO("2026-10-29T15:45:00.000Z", "01:30")).toBe("2026-10-30T00:30:00.000Z");
  });
});
