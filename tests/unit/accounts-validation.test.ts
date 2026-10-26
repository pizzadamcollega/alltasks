import { describe, expect, it } from "vitest";
import { createEmployeeSchema, createManagerSchema } from "@/features/accounts/validation";

const PIJP = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f601";
const ZUID = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f602";

const base = { fullName: "Ahmet Yılmaz", username: "ahmet.yilmaz", password: "geciciSifre1" };

describe("createManagerSchema", () => {
  it("accepts one branch", () => {
    expect(createManagerSchema.safeParse({ ...base, branchId: PIJP }).success).toBe(true);
  });

  it("rejects a missing branch", () => {
    expect(createManagerSchema.safeParse({ ...base, branchId: null }).success).toBe(false);
  });

  it("rejects a short password", () => {
    expect(createManagerSchema.safeParse({ ...base, password: "kisa", branchId: PIJP }).success).toBe(
      false,
    );
  });
});

describe("createEmployeeSchema", () => {
  const employee = { ...base, hourlyRate: "14", startedOn: "2026-10-26" };

  it("accepts several branches and coerces the rate", () => {
    const parsed = createEmployeeSchema.safeParse({ ...employee, branchIds: [PIJP, ZUID] });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.hourlyRate).toBe(14);
  });

  it("rejects an empty branch list", () => {
    expect(createEmployeeSchema.safeParse({ ...employee, branchIds: [] }).success).toBe(false);
  });
});
