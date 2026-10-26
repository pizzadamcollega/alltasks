import { describe, expect, it } from "vitest";
import { entryAmount, formatEUR } from "@/lib/money";
import { remainingBalance } from "@/lib/earnings";

describe("formatEUR", () => {
  it("formats amounts with a euro prefix and tr-TR grouping", () => {
    expect(formatEUR(812.5)).toBe("€812,50");
    expect(formatEUR(6510.4)).toBe("€6.510,40");
  });

  it("uses a true minus sign for negative amounts", () => {
    expect(formatEUR(-150)).toBe("−€150,00");
  });

  it("accepts numeric strings (as returned by Postgres numeric columns)", () => {
    expect(formatEUR("111.58")).toBe("€111,58");
  });
});

describe("entryAmount", () => {
  it("multiplies rounded minutes by the hourly rate, rounded to cents", () => {
    expect(entryAmount(515, 13)).toBeCloseTo(111.58, 2);
    expect(entryAmount(75, 12.5)).toBeCloseTo(15.63, 2);
  });
});

describe("remainingBalance", () => {
  it("subtracts payments from the approved amount", () => {
    expect(
      remainingBalance({
        approvedAmount: 891.67,
        payments: [{ amount: 150 }],
      }),
    ).toBeCloseTo(741.67, 2);
  });

  it("returns the full approved amount when there are no payments", () => {
    expect(remainingBalance({ approvedAmount: 812.5, payments: [] })).toBe(812.5);
  });
});
