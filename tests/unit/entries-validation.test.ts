import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editEntrySchema } from "@/features/entries/validation";

const NOW = new Date("2026-10-24T22:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("editEntrySchema", () => {
  it("accepts a normal same-night shift", () => {
    const result = editEntrySchema.safeParse({
      startAt: "2026-10-24T15:00:00.000Z",
      endAt: "2026-10-24T21:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end time before the start time", () => {
    const result = editEntrySchema.safeParse({
      startAt: "2026-10-24T21:00:00.000Z",
      endAt: "2026-10-24T15:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a shift longer than 16 hours", () => {
    const result = editEntrySchema.safeParse({
      startAt: "2026-10-24T00:00:00.000Z",
      endAt: "2026-10-24T17:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an end time more than 5 minutes in the future", () => {
    const result = editEntrySchema.safeParse({
      startAt: "2026-10-24T20:00:00.000Z",
      endAt: "2026-10-24T22:10:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("allows an end time within the 5-minute future grace window", () => {
    const result = editEntrySchema.safeParse({
      startAt: "2026-10-24T20:00:00.000Z",
      endAt: "2026-10-24T22:04:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
