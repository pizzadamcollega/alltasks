"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { amsterdamLocalToISO, isoToAmsterdamLocalInput } from "@/lib/time";
import { editOwnEntryAction, type EntryActionResult } from "@/features/entries/actions";

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
  async function action(
    _previous: EntryActionResult,
    formData: FormData,
  ): Promise<EntryActionResult> {
    const startLocal = String(formData.get("startAt"));
    const endLocal = String(formData.get("endAt"));
    const result = await editOwnEntryAction(
      entryId,
      branchSlug,
      amsterdamLocalToISO(startLocal),
      amsterdamLocalToISO(endLocal),
    );
    if (!result.error) onSaved();
    return result;
  }

  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="startAt">Başlangıç</Label>
        <Input
          id="startAt"
          name="startAt"
          type="datetime-local"
          defaultValue={isoToAmsterdamLocalInput(startAt)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="endAt">Bitiş</Label>
        <Input
          id="endAt"
          name="endAt"
          type="datetime-local"
          defaultValue={endAt ? isoToAmsterdamLocalInput(endAt) : undefined}
          required
        />
      </div>
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
