"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDayShortTR, TR_WEEKDAYS, weekDates } from "@/lib/time";
import { submitShiftRequestsAction } from "@/features/shifts/actions";
import type { ShiftRequestRow } from "@/features/shifts/queries";
import { StatusChip } from "./status-chip";
import { TimePicker } from "./time-picker";

const DEFAULT_START = "16:45";

type DayDraft = { on: boolean; start: string };

/**
 * Employee "Haftalık program" request: tap the days you can work, pick a
 * start time, "Onaya gönder". Days the yönetici already decided are shown
 * with their result and cannot be changed here.
 */
export function ShiftRequestForm({
  branchId,
  branchSlug,
  monday,
  requests,
  defaultStart = DEFAULT_START,
}: {
  branchId: string;
  branchSlug: string;
  monday: string;
  requests: ShiftRequestRow[];
  defaultStart?: string;
}) {
  const [pending, startTransition] = useTransition();
  const byDate = new Map(requests.map((r) => [r.workDate, r]));
  const dates = weekDates(monday);

  const initial = () =>
    Object.fromEntries(
      dates.map((date) => {
        const request = byDate.get(date);
        return [date, { on: request?.status === "pending", start: request?.startTime ?? defaultStart }];
      }),
    ) as Record<string, DayDraft>;
  const [draft, setDraft] = useState<Record<string, DayDraft>>(initial);
  const [note, setNote] = useState(requests.find((r) => r.status === "pending")?.note ?? "");

  const editable = dates.filter((date) => {
    const status = byDate.get(date)?.status;
    return status !== "approved" && status !== "rejected";
  });
  const chosen = editable.filter((date) => draft[date].on);
  const hadPending = requests.some((r) => r.status === "pending");
  const lastStart = chosen.length ? draft[chosen.at(-1)!].start : defaultStart;

  function update(date: string, patch: Partial<DayDraft>) {
    setDraft((current) => ({ ...current, [date]: { ...current[date], ...patch } }));
  }

  function submit() {
    startTransition(async () => {
      const result = await submitShiftRequestsAction(branchId, branchSlug, {
        monday,
        note: note.trim() || undefined,
        days: chosen.map((date) => ({ date, start: draft[date].start })),
      });
      if (result.error) toast.error(result.error);
      else if (chosen.length === 0) toast.success("İsteklerin geri çekildi");
      else toast.success(`${chosen.length} gün onaya gönderildi`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
        {dates.map((date, index) => {
          const request = byDate.get(date);
          const decided = request && request.status !== "pending" ? request : null;
          const day = draft[date];
          return (
            <li
              key={date}
              className={cn(
                "flex min-h-[4.5rem] items-center gap-3 rounded-card border p-3",
                decided?.status === "approved"
                  ? "border-pz-ok/40 bg-pz-ok-soft"
                  : day.on && !decided
                    ? "border-pz-accent/40 bg-pz-surface"
                    : "border-pz-border bg-pz-surface",
              )}
            >
              <div className="flex w-24 shrink-0 flex-col">
                <span className="text-sm font-bold text-pz-text">{TR_WEEKDAYS[index]}</span>
                <span className="text-xs tabular-nums text-pz-muted">{formatDayShortTR(date)}</span>
                {request?.status === "pending" ? (
                  <StatusChip label="Bekliyor" tone="warn" className="mt-1 self-start" />
                ) : null}
              </div>

              {decided ? (
                <div className="flex flex-1 items-center justify-end gap-2">
                  {decided.status === "approved" ? (
                    <span className="text-base font-bold tabular-nums text-pz-text">{decided.startTime}</span>
                  ) : null}
                  <StatusChip
                    label={decided.status === "approved" ? "Onaylandı" : "Reddedildi"}
                    tone={decided.status === "approved" ? "ok" : "bad"}
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-end gap-2">
                  {day.on ? (
                    <div className="w-[6.5rem]">
                      <TimePicker
                        id={`request-${date}`}
                        label={`${TR_WEEKDAYS[index]} başlangıç saati`}
                        value={day.start}
                        onChange={(start) => update(date, { start })}
                        size="sm"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    aria-pressed={day.on}
                    aria-label={`${TR_WEEKDAYS[index]} ${formatDayShortTR(date)} çalışabilirim`}
                    onClick={() => update(date, { on: !day.on, start: day.on ? day.start : lastStart })}
                    className={cn(
                      "flex h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-accent",
                      day.on
                        ? "border-pz-accent bg-pz-accent text-pz-on-accent"
                        : "border-pz-border bg-pz-surface-2 text-pz-text hover:border-pz-muted",
                    )}
                  >
                    {day.on ? <Check className="size-4" aria-hidden /> : null}
                    {day.on ? "Seçildi" : "Seç"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="request-note" className="text-sm font-medium">
          Not (isteğe bağlı)
        </label>
        <Input
          id="request-note"
          value={note}
          maxLength={200}
          placeholder="Ör. Cuma 18:00'den önce gelemem"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Button
        type="button"
        disabled={pending || editable.length === 0 || (chosen.length === 0 && !hadPending)}
        onClick={submit}
        className="h-12 gap-2 rounded-xl text-base"
      >
        <Send className="size-4" aria-hidden />
        {pending
          ? "Gönderiliyor…"
          : chosen.length === 0 && hadPending
            ? "İsteklerimi geri çek"
            : `Onaya gönder${chosen.length ? ` (${chosen.length} gün)` : ""}`}
      </Button>
    </div>
  );
}
