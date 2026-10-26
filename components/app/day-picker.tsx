"use client";

import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysToDate, formatDayShortTR, weekdayShortTR } from "@/lib/time";

function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

function chipLabel(date: string, today: string): { top: string; bottom: string } {
  if (date === today) return { top: "Bugün", bottom: formatDayShortTR(date) };
  if (date === addDaysToDate(today, -1)) return { top: "Dün", bottom: formatDayShortTR(date) };
  return { top: weekdayShortTR(isoWeekday(date)), bottom: formatDayShortTR(date) };
}

/**
 * Horizontal strip of the last `days` days ("Bugün", "Dün", "Cmt 24 Eki"…),
 * newest first, plus a "Başka gün" chip that opens the native calendar for
 * anything older. One tap for the common case instead of a date dialog.
 */
export function DayPicker({
  label,
  value,
  onChange,
  today,
  min,
  days = 7,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  today: string;
  /** Earliest pickable date ('YYYY-MM-DD'); `today` is always the latest. */
  min?: string;
  days?: number;
  name?: string;
}) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const recent = Array.from({ length: days }, (_, i) => addDaysToDate(today, -i)).filter(
    (d) => !min || d >= min,
  );
  const outsideStrip = value && !recent.includes(value);

  function openCalendar() {
    const input = nativeRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }

  const chip = (date: string) => {
    const selected = date === value;
    const { top, bottom } = chipLabel(date, today);
    return (
      <button
        key={date}
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => onChange(date)}
        className={cn(
          "flex h-14 min-w-[4.25rem] shrink-0 snap-start flex-col items-center justify-center rounded-xl border px-2 transition-colors",
          selected
            ? "border-pz-accent bg-pz-accent text-pz-on-accent"
            : "border-pz-border bg-pz-surface text-pz-text hover:border-pz-muted",
        )}
      >
        <span className="text-sm font-bold">{top}</span>
        <span className={cn("text-[11px] tabular-nums", selected ? "opacity-90" : "text-pz-muted")}>{bottom}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${name ?? "day"}-label`} className="text-sm font-medium">
        {label}
      </span>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div
        role="radiogroup"
        aria-labelledby={`${name ?? "day"}-label`}
        className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {recent.map(chip)}
        {outsideStrip ? chip(value) : null}
        <div className="relative shrink-0 snap-start">
          <button
            type="button"
            onClick={openCalendar}
            className="flex h-14 min-w-[4.25rem] flex-col items-center justify-center rounded-xl border border-dashed border-pz-border bg-pz-surface px-2 text-pz-muted hover:border-pz-muted"
          >
            <CalendarDays className="size-4" aria-hidden />
            <span className="text-[11px] font-semibold">Başka gün</span>
          </button>
          {/* sibling, not child: an input inside a button is nested-interactive */}
          <input
            ref={nativeRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            min={min}
            max={today}
            value={value}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className="pointer-events-none absolute inset-0 opacity-0"
          />
        </div>
      </div>
    </div>
  );
}
