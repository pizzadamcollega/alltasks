import type { StaffDuty } from "@/types/database";

export const DUTIES: readonly StaffDuty[] = ["kasaci", "bezorgd", "usta"] as const;

const LABELS: Record<StaffDuty, string> = {
  kasaci: "Kasacı",
  bezorgd: "Bezorgd",
  usta: "Usta",
};

export function dutyLabel(duty: StaffDuty): string {
  return LABELS[duty];
}

/** "Kasacı, Usta" — in the fixed DUTIES order, whatever order the array came in. */
export function dutyList(duties: readonly StaffDuty[]): string {
  return DUTIES.filter((d) => duties.includes(d)).map(dutyLabel).join(", ");
}
