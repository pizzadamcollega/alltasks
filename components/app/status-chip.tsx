import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "warn" | "bad" | "info" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  ok: "bg-pz-ok-soft text-pz-ok",
  warn: "bg-pz-warn-soft text-pz-warn",
  bad: "bg-pz-bad-soft text-pz-bad",
  info: "bg-pz-info-soft text-pz-info",
  neutral: "bg-pz-surface-2 text-pz-muted",
};

/**
 * Status is always text + colour, never colour alone (CLAUDE.md golden rule 7 /
 * DESIGN.md §1) — e.g. "Bekliyor", "Onaylandı", "Eksik".
 */
export function StatusChip({
  label,
  tone,
  className,
}: {
  label: string;
  tone: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-chip px-2 py-[3px] text-[11px] font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
