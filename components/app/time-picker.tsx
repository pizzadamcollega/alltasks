"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// Evening-first: a pizzeria shift starts in the afternoon and often ends after midnight.
const HOURS = [...Array.from({ length: 16 }, (_, i) => i + 8), ...Array.from({ length: 8 }, (_, i) => i)];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Big tappable "17:00" button; tapping opens a bottom sheet with an hour grid
 * and a 5-minute grid (entries are rounded to 5 minutes anyway). The hour is
 * a draft; `onChange` fires once — on a minute tap (which also closes the
 * sheet) or on Tamam — so a save-on-change caller never sees a half value.
 * Replaces the native time input, which differs on every phone.
 */
export function TimePicker({
  id,
  label,
  value,
  onChange,
  name,
  size = "lg",
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** When set, a hidden input carries the value into a surrounding <form>. */
  name?: string;
  size?: "lg" | "sm";
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hour, minute] = draft ? draft.split(":").map(Number) : [null, null];

  function openSheet() {
    setDraft(value);
    setOpen(true);
  }

  function commit(next: string) {
    setOpen(false);
    if (next && next !== value) onChange(next);
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        id={id}
        type="button"
        aria-label={`${label}: ${value || "seçilmedi"}`}
        aria-haspopup="dialog"
        onClick={openSheet}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border bg-pz-surface px-3 text-left tabular-nums transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-accent",
          size === "lg" ? "h-14 text-2xl font-bold" : "h-11 text-base font-semibold",
          invalid ? "border-pz-bad" : "border-pz-border hover:border-pz-muted",
          value ? "text-pz-text" : "text-pz-muted",
        )}
      >
        <span>{value || "--:--"}</span>
        <Clock className={cn("shrink-0 text-pz-muted", size === "lg" ? "size-5" : "size-4")} aria-hidden />
      </button>

      <Sheet open={open} onOpenChange={(next) => (next ? openSheet() : setOpen(false))}>
        <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-sheet pb-[max(16px,env(safe-area-inset-bottom))]">
          <SheetHeader className="pb-0">
            {/* pr-10 keeps the big time clear of the sheet's close button */}
            <SheetTitle className="flex items-baseline justify-between pr-10">
              <span>{label}</span>
              <span className="text-3xl font-bold tabular-nums text-pz-accent">
                {hour != null ? pad(hour) : "--"}:{minute != null ? pad(minute) : "--"}
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.4px] text-pz-muted">Saat</legend>
              <div className="grid grid-cols-6 gap-1.5">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={h === hour}
                    onClick={() => setDraft(`${pad(h)}:${pad(minute ?? 0)}`)}
                    className={cn(
                      "h-11 rounded-lg text-base font-semibold tabular-nums transition-colors",
                      h === hour
                        ? "bg-pz-accent text-pz-on-accent"
                        : "bg-pz-surface-2 text-pz-text hover:bg-pz-accent-soft",
                    )}
                  >
                    {pad(h)}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.4px] text-pz-muted">Dakika</legend>
              <div className="grid grid-cols-6 gap-1.5">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={m === minute}
                    onClick={() => commit(`${pad(hour ?? 17)}:${pad(m)}`)}
                    className={cn(
                      "h-11 rounded-lg text-base font-semibold tabular-nums transition-colors",
                      m === minute
                        ? "bg-pz-accent text-pz-on-accent"
                        : "bg-pz-surface-2 text-pz-text hover:bg-pz-accent-soft",
                    )}
                  >
                    :{pad(m)}
                  </button>
                ))}
              </div>
            </fieldset>

            <Button type="button" className="h-12 rounded-xl text-base" onClick={() => commit(draft)}>
              Tamam
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
