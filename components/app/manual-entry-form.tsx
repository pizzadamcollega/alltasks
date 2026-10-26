"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addDaysToDate } from "@/lib/time";
import { addOwnEntryAction, type EntryActionResult } from "@/features/entries/actions";
import { ShiftRangeFields, readShiftRange } from "./shift-range-fields";

const initialState: EntryActionResult = {};

/**
 * S2 "Çalıştığım saatler" — the only way an employee records work (no
 * Başla/Bitir timer, D-38). `suggestedStart` pre-fills today's programmed
 * start time so the common case is: tap Bitiş, pick, Kaydet.
 */
export function ManualEntryForm({
  branchId,
  branchSlug,
  today,
  suggestedStart,
}: {
  branchId: string;
  branchSlug: string;
  today: string;
  suggestedStart?: string;
}) {
  // bumping the key remounts the fields, i.e. clears them after a save
  const [formKey, setFormKey] = useState(0);

  async function action(
    _previous: EntryActionResult,
    formData: FormData,
  ): Promise<EntryActionResult> {
    const range = readShiftRange(formData);
    if (!range) return { error: "Başlangıç ve bitiş saatini seç." };
    const result = await addOwnEntryAction(branchId, branchSlug, range.startAt, range.endAt);
    if (!result.error) {
      toast.success("Kayıt eklendi");
      setFormKey((k) => k + 1);
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

          <ShiftRangeFields
            key={formKey}
            idPrefix="manual"
            today={today}
            minDate={addDaysToDate(today, -31)}
            defaultStart={suggestedStart}
          />

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
