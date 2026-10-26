"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { addDaysToDate, formatDuration, manualEntryRange, roundMinutes } from "@/lib/time";
import { addOwnEntryAction, type EntryActionResult } from "@/features/entries/actions";

const initialState: EntryActionResult = {};

/**
 * S2 "Saatleri gir" — the only way an employee records work (no Başla/Bitir
 * timer, D-38): pick a day, type start and end. End before start means the
 * shift ran past midnight.
 */
export function ManualEntryForm({
  branchId,
  branchSlug,
  today,
}: {
  branchId: string;
  branchSlug: string;
  today: string;
}) {
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const preview = start && end ? manualEntryRange(date, start, end) : null;
  const previewMinutes = preview
    ? roundMinutes(new Date(preview.startAt), new Date(preview.endAt))
    : null;

  async function action(
    _previous: EntryActionResult,
    formData: FormData,
  ): Promise<EntryActionResult> {
    const range = manualEntryRange(
      String(formData.get("date")),
      String(formData.get("start")),
      String(formData.get("end")),
    );
    const result = await addOwnEntryAction(branchId, branchSlug, range.startAt, range.endAt);
    if (!result.error) {
      toast.success("Kayıt eklendi");
      setStart("");
      setEnd("");
    }
    return result;
  }

  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <Card className="rounded-card">
      <CardContent className="pt-4">
        <form action={formAction} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-pz-text">
            <PenLine className="size-4 text-pz-accent" aria-hidden />
            Çalıştığım saatler
          </h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manualDate">Tarih</Label>
            <Input
              id="manualDate"
              name="date"
              type="date"
              value={date}
              min={addDaysToDate(today, -31)}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manualStart">Başlangıç</Label>
              <Input
                id="manualStart"
                name="start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
                className="h-12 text-base tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manualEnd">Bitiş</Label>
              <Input
                id="manualEnd"
                name="end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
                className="h-12 text-base tabular-nums"
              />
            </div>
          </div>

          {previewMinutes != null ? (
            <p className="text-sm text-pz-muted" aria-live="polite">
              Süre: <span className="font-semibold text-pz-text">{formatDuration(previewMinutes)}</span>
              {end <= start ? " · bitiş ertesi gün" : ""}
            </p>
          ) : null}

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-pz-bad">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="h-[52px] rounded-xl text-base">
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
