import { describe, expect, it } from "vitest";
import { decideShiftRequestSchema, submitShiftRequestsSchema, upsertShiftSchema } from "@/features/shifts/validation";

const USER = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f601";

describe("upsertShiftSchema", () => {
  it("accepts a 24h start time", () => {
    expect(upsertShiftSchema.safeParse({ userId: USER, workDate: "2026-10-26", startTime: "16:45" }).success).toBe(true);
  });

  it("rejects an impossible time or a missing employee", () => {
    expect(upsertShiftSchema.safeParse({ userId: USER, workDate: "2026-10-26", startTime: "24:00" }).success).toBe(false);
    expect(upsertShiftSchema.safeParse({ userId: "", workDate: "2026-10-26", startTime: "16:45" }).success).toBe(false);
  });
});

describe("submitShiftRequestsSchema", () => {
  it("accepts chosen days with start times, and an empty list (withdraw)", () => {
    expect(
      submitShiftRequestsSchema.safeParse({
        monday: "2026-11-02",
        days: [{ date: "2026-11-02", start: "16:45" }, { date: "2026-11-06", start: "17:00" }],
      }).success,
    ).toBe(true);
    expect(submitShiftRequestsSchema.safeParse({ monday: "2026-11-02", days: [] }).success).toBe(true);
  });

  it("rejects a day twice, a bad time or an over-long note", () => {
    const day = { date: "2026-11-02", start: "16:45" };
    expect(submitShiftRequestsSchema.safeParse({ monday: "2026-11-02", days: [day, day] }).success).toBe(false);
    expect(
      submitShiftRequestsSchema.safeParse({ monday: "2026-11-02", days: [{ date: "2026-11-02", start: "7pm" }] }).success,
    ).toBe(false);
    expect(
      submitShiftRequestsSchema.safeParse({ monday: "2026-11-02", days: [day], note: "x".repeat(201) }).success,
    ).toBe(false);
  });
});

describe("decideShiftRequestSchema", () => {
  it("needs a request id and a decision; start time optional", () => {
    expect(decideShiftRequestSchema.safeParse({ requestId: USER, approve: true }).success).toBe(true);
    expect(decideShiftRequestSchema.safeParse({ requestId: USER, approve: true, startTime: "18:15" }).success).toBe(true);
    expect(decideShiftRequestSchema.safeParse({ requestId: "x", approve: false }).success).toBe(false);
  });
});
