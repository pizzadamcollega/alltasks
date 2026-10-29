import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysToDate, formatDayShortTR, TR_WEEKDAYS, weekStart } from "@/lib/time";
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
  badge,
  notice,
  minMonday,
  maxMonday,
}: {
  days: ShiftDay[];
  today: string;
  monday: string;
  /** Page the ‹ › links point at; the week goes in `?hafta=`. */
  basePath: string;
  currentUserId?: string;
  editor?: { branchId: string; branchSlug: string; employees: BranchEmployee[] };
  actions?: React.ReactNode;
  /** Shown next to the week title, e.g. "Taslak" / "Yayınlandı". */
  badge?: React.ReactNode;
  /** Replaces the day list, e.g. while a future week is not published yet. */
  notice?: React.ReactNode;
  /** Limits for the ‹ › links (see `WeekNav`). */
  minMonday?: string;
  maxMonday?: string;
}) {
  return (
    <section aria-label="Haftalık program" className="flex flex-col gap-3">
      <WeekNav
        monday={monday}
        today={today}
        basePath={basePath}
        badge={badge}
        minMonday={minMonday}
        maxMonday={maxMonday}
      />

      {actions}

      {notice ? (
        notice
      ) : (
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
              <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 lg:flex-col lg:justify-start">
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
                      <li
                        key={shift.id}
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          // 7 narrow columns on desktop: time above the name so names never truncate
                          !editor && "lg:flex-col lg:items-start lg:gap-0",
                        )}
                      >
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
                            "min-w-0 truncate lg:whitespace-normal lg:break-words",
                            isMe ? "font-bold text-pz-accent" : state === "past" ? "text-pz-muted" : "text-pz-text",
                          )}
                        >
                          {shift.fullName}
                          {isMe ? " (sen)" : ""}
                        </span>
                        {shift.isCashier ? (
                          <span className="rounded-chip bg-pz-accent-soft px-1.5 py-px text-[11px] font-bold text-pz-accent">
                            Kasacı
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      )}
    </section>
  );
}

/**
 * Week title + ‹ › arrows (`?hafta=` links). `minMonday`/`maxMonday` disable
 * the arrows at the ends, e.g. requests may only go to the next 8 weeks.
 */
export function WeekNav({
  monday,
  today,
  basePath,
  title = "Haftalık program",
  badge,
  minMonday,
  maxMonday,
  homeMonday,
}: {
  monday: string;
  today: string;
  basePath: string;
  title?: string;
  badge?: React.ReactNode;
  minMonday?: string;
  maxMonday?: string;
  /** Week the "Bu hafta" shortcut returns to; defaults to the current week. */
  homeMonday?: string;
}) {
  const sunday = addDaysToDate(monday, 6);
  const home = homeMonday ?? weekStart(today);
  const weekHref = (date: string) => `${basePath}?hafta=${date}`;
  const prev = addDaysToDate(monday, -7);
  const next = addDaysToDate(monday, 7);
  const arrow = "flex size-11 items-center justify-center rounded-xl border border-pz-border bg-pz-surface text-pz-text";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-pz-text">{title}</h2>
          {badge}
        </div>
        <p className="text-sm tabular-nums text-pz-muted">
          {formatDayShortTR(monday)} – {formatDayShortTR(sunday)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {monday !== home ? (
          <Link href={weekHref(home)} className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-pz-accent">
            {homeMonday ? "Gelecek hafta" : "Bu hafta"}
          </Link>
        ) : null}
        {minMonday && prev < minMonday ? (
          <span aria-hidden className={cn(arrow, "opacity-40")}>
            <ChevronLeft className="size-5" />
          </span>
        ) : (
          <Link href={weekHref(prev)} aria-label="Önceki hafta" className={arrow}>
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        )}
        {maxMonday && next > maxMonday ? (
          <span aria-hidden className={cn(arrow, "opacity-40")}>
            <ChevronRight className="size-5" />
          </span>
        ) : (
          <Link href={weekHref(next)} aria-label="Sonraki hafta" className={arrow}>
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Small "Taslak" / "Yayınlandı" chip — text, not colour alone. */
export function PublishBadge({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        "rounded-chip px-2 py-[3px] text-[11px] font-bold",
        published ? "bg-pz-ok-soft text-pz-ok" : "bg-pz-warn-soft text-pz-warn",
      )}
    >
      {published ? "Yayınlandı" : "Taslak"}
    </span>
  );
}
