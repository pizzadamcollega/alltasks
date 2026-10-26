"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { formatDuration, manualEntryRange, roundMinutes } from "@/lib/time";
import { DayPicker } from "./day-picker";
import { TimePicker } from "./time-picker";

/**
 * Day + start + end for one shift, shared by every form that records hours
 * (Çalıştığım saatler, Geçmiş düzenle, Onay "Kayıt ekle"/"Düzenle"). Values
 * reach the surrounding <form> as hidden inputs `date`, `start`, `end`; turn
 * them into instants with `manualEntryRange` (end ≤ start = next day).
 */
export function ShiftRangeFields({
  idPrefix,
  today,
  minDate,
  defaultDate,
  defaultStart = "",
  defaultEnd = "",
  showDate = true,
}: {
  idPrefix: string;
  today: string;
  minDate?: string;
  defaultDate?: string;
  defaultStart?: string;
  defaultEnd?: string;
  /** Hide the day strip when the day is fixed by the screen (still submitted). */
  showDate?: boolean;
}) {
  const [date, setDate] = useState(defaultDate ?? today);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const range = start && end ? manualEntryRange(date, start, end) : null;
  const minutes = range ? roundMinutes(new Date(range.startAt), new Date(range.endAt)) : null;

  return (
    <div className="flex flex-col gap-3">
      {showDate ? (
        <DayPicker label="Gün" name="date" value={date} onChange={setDate} today={today} min={minDate} />
      ) : (
        <input type="hidden" name="date" value={date} />
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-start`} className="text-sm font-medium">
            Başlangıç
          </label>
          <TimePicker id={`${idPrefix}-start`} label="Başlangıç" name="start" value={start} onChange={setStart} />
        </div>
        <ArrowRight className="mb-[18px] size-4 text-pz-muted" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-end`} className="text-sm font-medium">
            Bitiş
          </label>
          <TimePicker id={`${idPrefix}-end`} label="Bitiş" name="end" value={end} onChange={setEnd} />
        </div>
      </div>

      <p className="min-h-5 text-sm text-pz-muted" aria-live="polite">
        {minutes != null ? (
          <>
            Süre: <span className="font-semibold text-pz-text">{formatDuration(minutes)}</span>
            {end <= start ? " · bitiş ertesi gün" : ""}
          </>
        ) : (
          "Başlangıç ve bitiş saatini seç."
        )}
      </p>
    </div>
  );
}

/** Reads the hidden inputs ShiftRangeFields put into a form. */
export function readShiftRange(formData: FormData): { startAt: string; endAt: string } | null {
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  if (!date || !start || !end) return null;
  return manualEntryRange(date, start, end);
}
