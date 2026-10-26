import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysToDate, formatDayShortTR, TR_WEEKDAYS } from "@/lib/time";
import type { ShiftDay } from "@/features/shifts/queries";
import type { BranchEmployee } from "@/features/branch/queries";
import { ShiftDayEditor } from "./shift-day-editor";

type DayState = "past" | "today" | "future";

const DAY_CLASSES: Record<DayState, string> = {
  past: "border-pz-border bg-pz-surface-2",
  today: "border-2 border-pz-ok bg-pz-ok-soft",
  future: "border-pz-info/25 bg-pz-info-soft",
};

function weekdayName(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return TR_WEEKDAYS[(utcDay + 6) % 7];
}

/**
 * The weekly shift board (Excel "takvim" replacement). Read-only for
 * everyone; pass `editor` to give a manager add/remove/time controls per day.
 * State is always spelled out ("Geçti" / "Bugün"), never colour alone.
 */
export function WeekCalendar({
  days,
  today,
  monday,
  basePath,
  currentUserId,
  editor,
  actions,
}: {
  days: ShiftDay[];
  today: string;
  monday: string;
  /** Page the ‹ › links point at; the week goes in `?hafta=`. */
  basePath: string;
  currentUserId?: string;
  editor?: { branchId: string; branchSlug: string; employees: BranchEmployee[] };
  actions?: React.ReactNode;
}) {
  const sunday = addDaysToDate(monday, 6);
  const isCurrentWeek = today >= monday && today <= sunday;
  const weekHref = (date: string) => `${basePath}?hafta=${date}`;

  return (
    <section aria-label="Haftalık program" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-pz-text">Haftalık program</h2>
          <p className="text-sm tabular-nums text-pz-muted">
            {formatDayShortTR(monday)} – {formatDayShortTR(sunday)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!isCurrentWeek ? (
            <Link
              href={basePath}
              className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-pz-accent"
            >
              Bu hafta
            </Link>
          ) : null}
          <Link
            href={weekHref(addDaysToDate(monday, -7))}
            aria-label="Önceki hafta"
            className="flex size-11 items-center justify-center rounded-xl border border-pz-border bg-pz-surface text-pz-text"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <Link
            href={weekHref(addDaysToDate(monday, 7))}
            aria-label="Sonraki hafta"
            className="flex size-11 items-center justify-center rounded-xl border border-pz-border bg-pz-surface text-pz-text"
          >
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        </div>
      </div>

      {actions}

      <ol
        className={cn(
          "grid grid-cols-1 gap-2",
          editor ? "sm:grid-cols-2 lg:grid-cols-3" : "lg:grid-cols-7",
        )}
      >
        {days.map((day) => {
          const state: DayState = day.date < today ? "past" : day.date === today ? "today" : "future";
          return (
            <li
              key={day.date}
              aria-current={state === "today" ? "date" : undefined}
              className={cn("flex flex-col gap-2 rounded-card border p-3 lg:min-h-40", DAY_CLASSES[state])}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-pz-text">{weekdayName(day.date)}</span>
                  <span className="text-xs tabular-nums text-pz-muted">{formatDayShortTR(day.date)}</span>
                </div>
                {state === "today" ? (
                  <span className="rounded-chip bg-pz-ok px-2 py-[3px] text-[11px] font-bold text-pz-surface">
                    Bugün
                  </span>
                ) : state === "past" ? (
                  <span className="rounded-chip bg-pz-surface px-2 py-[3px] text-[11px] font-semibold text-pz-muted">
                    Geçti
                  </span>
                ) : null}
              </div>

              {editor ? (
                <ShiftDayEditor
                  day={day}
                  branchId={editor.branchId}
                  branchSlug={editor.branchSlug}
                  employees={editor.employees}
                />
              ) : day.shifts.length === 0 ? (
                <p className="text-[13px] text-pz-muted">Program yok</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {day.shifts.map((shift) => {
                    const isMe = shift.userId === currentUserId;
                    return (
                      <li key={shift.id} className="flex items-center gap-2 text-sm">
                        <span
                          className={cn(
                            "w-11 shrink-0 font-bold tabular-nums",
                            state === "past" ? "text-pz-muted" : "text-pz-text",
                          )}
                        >
                          {shift.startTime}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 truncate",
                            isMe ? "font-bold text-pz-accent" : state === "past" ? "text-pz-muted" : "text-pz-text",
                          )}
                        >
                          {shift.fullName}
                          {isMe ? " (sen)" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
