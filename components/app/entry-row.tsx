import { cn } from "@/lib/utils";
import { StatusChip, type StatusTone } from "@/components/app/status-chip";
import { Pencil } from "lucide-react";

export interface EntryRowProps {
  dateLabel: string;
  timeRange: string;
  duration: string;
  /** Omit when the amount should stay hidden from this viewer (e.g. rate not shared). */
  amount?: string;
  status?: { label: string; tone: StatusTone };
  /** "Düzenlendi" tag, with the original value shown as a caption. */
  editedNote?: string;
  onClick?: () => void;
  className?: string;
}

export function EntryRow({
  dateLabel,
  timeRange,
  duration,
  amount,
  status,
  editedNote,
  onClick,
  className,
}: EntryRowProps) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-start justify-between gap-3 py-2.5 text-left",
        onClick && "cursor-pointer rounded-md transition-colors hover:bg-pz-surface-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-pz-text">{dateLabel}</span>
        <span className="text-[13px] tabular-nums text-pz-muted">
          {timeRange} · {duration}
        </span>
        {editedNote ? (
          <span className="flex items-center gap-1 text-xs font-medium text-pz-warn">
            <Pencil className="size-3" aria-hidden />
            {editedNote}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {amount ? (
          <span className="text-[15px] font-bold tabular-nums text-pz-text">{amount}</span>
        ) : null}
        {status ? <StatusChip label={status.label} tone={status.tone} /> : null}
      </div>
    </Wrapper>
  );
}
