"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { endTimeToISO, formatDuration, formatTimeTR, nowTimeAmsterdam, roundMinutes, startTimeToISO } from "@/lib/time";
import { finishEntryAction, startEntryAction } from "@/features/entries/actions";
import { TimePicker } from "./time-picker";

/**
 * D-46: the working day in two steps. "Mesaiye başla" stores only the start
 * (pre-filled with now, editable); later "Mesaiyi bitir" stores the end and
 * the entry goes to the day's kasacı for approval.
 */
export function ClockCard({
  branchId,
  branchSlug,
  openEntry,
}: {
  branchId: string;
  branchSlug: string;
  openEntry: { id: string; startAt: string } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [time, setTime] = useState(() => nowTimeAmsterdam());

  function start() {
    startTransition(async () => {
      const result = await startEntryAction(branchId, branchSlug, startTimeToISO(time));
      if (result.error) toast.error(result.error);
      else {
        toast.success(`Mesai başladı · ${time}`);
        setTime(nowTimeAmsterdam());
      }
    });
  }

  function finish(entry: { id: string; startAt: string }) {
    const endAt = endTimeToISO(entry.startAt, time);
    startTransition(async () => {
      const result = await finishEntryAction(entry.id, branchSlug, endAt);
      if (result.error) toast.error(result.error);
      else toast.success("Mesai bitti, kasacı onayına gönderildi");
    });
  }

  if (!openEntry) {
    return (
      <Card className="rounded-card">
        <CardContent className="flex flex-col gap-3 pt-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-pz-text">
            <Play className="size-4 text-pz-accent" aria-hidden />
            Mesaiye başla
          </h2>
          <TimePicker id="clock-start" label="Başlangıç saati" value={time} onChange={setTime} />
          <Button type="button" disabled={pending} onClick={start} className="h-[52px] rounded-xl text-base">
            {pending ? "Kaydediliyor…" : "Mesaiye başla"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const endPreview = endTimeToISO(openEntry.startAt, time);
  const minutes = roundMinutes(new Date(openEntry.startAt), new Date(endPreview));

  return (
    <Card className="rounded-card border-pz-info/40">
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex flex-col">
          <h2 className="flex items-center gap-2 text-base font-bold text-pz-text">
            <Square className="size-4 text-pz-accent" aria-hidden />
            Mesai devam ediyor
          </h2>
          <p className="text-sm text-pz-muted">Başlangıç {formatTimeTR(openEntry.startAt)}</p>
        </div>
        <TimePicker id="clock-end" label="Bitiş saati" value={time} onChange={setTime} />
        {minutes != null && minutes > 0 ? (
          <p className="text-sm tabular-nums text-pz-muted">Toplam {formatDuration(minutes)}</p>
        ) : null}
        <Button
          type="button"
          disabled={pending}
          onClick={() => finish(openEntry)}
          className="h-[52px] rounded-xl text-base"
        >
          {pending ? "Kaydediliyor…" : "Mesaiyi bitir ve onaya gönder"}
        </Button>
      </CardContent>
    </Card>
  );
}
