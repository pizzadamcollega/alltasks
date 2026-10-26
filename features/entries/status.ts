import type { EntryStatus } from "@/types/database";
import type { StatusTone } from "@/components/app/status-chip";

/** CLAUDE.md glossary: open has no documented UI term, "Devam ediyor" is this app's label for it. */
const LABELS: Record<EntryStatus, string> = {
  open: "Devam ediyor",
  pending: "Bekliyor",
  approved: "Onaylandı",
};

const TONES: Record<EntryStatus, StatusTone> = {
  open: "info",
  pending: "warn",
  approved: "ok",
};

export function entryStatusLabel(status: EntryStatus): string {
  return LABELS[status];
}

export function entryStatusTone(status: EntryStatus): StatusTone {
  return TONES[status];
}
