import { describe, expect, it } from "vitest";
import { upsertShiftSchema } from "@/features/shifts/validation";

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
