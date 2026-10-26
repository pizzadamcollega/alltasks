"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { isoToAmsterdamLocalInput, todayInAmsterdam } from "@/lib/time";
import { editOwnEntryAction, type EntryActionResult } from "@/features/entries/actions";
import { ShiftRangeFields, readShiftRange } from "@/components/app/shift-range-fields";

const initialState: EntryActionResult = {};

export function EditEntryForm({
  entryId,
  branchSlug,
  startAt,
  endAt,
  onSaved,
}: {
  entryId: string;
  branchSlug: string;
  startAt: string;
  endAt: string | null;
  onSaved: () => void;
}) {
  const startLocal = isoToAmsterdamLocalInput(startAt);
  const endLocal = endAt ? isoToAmsterdamLocalInput(endAt) : "";

  async function action(
    _previous: EntryActionResult,
    formData: FormData,
  ): Promise<EntryActionResult> {
    const range = readShiftRange(formData);
    if (!range) return { error: "Başlangıç ve bitiş saatini seç." };
    const result = await editOwnEntryAction(entryId, branchSlug, range.startAt, range.endAt);
    if (!result.error) onSaved();
    return result;
  }

  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 p-4">
      <ShiftRangeFields
        idPrefix={`edit-${entryId}`}
        today={todayInAmsterdam()}
        defaultDate={startLocal.slice(0, 10)}
        defaultStart={startLocal.slice(11, 16)}
        defaultEnd={endLocal.slice(11, 16)}
      />
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-pz-bad">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="h-12 rounded-xl">
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}
