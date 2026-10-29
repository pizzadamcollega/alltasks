"use client";

import { useState } from "react";
import { EntryRow } from "@/components/app/entry-row";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDayTR, formatDuration, formatTimeTR } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { entryEditedNote, entryStatusLabel, entryStatusTone, isEntryEditableByOwner } from "@/features/entries/status";
import type { EntrySummary } from "@/features/entries/queries";
import { EditEntryForm } from "./edit-entry-form";

/** S5: tapping an entry no reviewer signed off yet opens the edit sheet; saving resends it (D-46). */
export function EditableEntryRow({
  entry,
  branchSlug,
}: {
  entry: EntrySummary;
  branchSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const editable = isEntryEditableByOwner(entry.status) && entry.endAt !== null;

  const row = (
    <EntryRow
      dateLabel={formatDayTR(entry.workDate)}
      timeRange={`${formatTimeTR(entry.startAt)} – ${entry.endAt ? formatTimeTR(entry.endAt) : "?"}`}
      duration={entry.roundedMinutes != null ? formatDuration(entry.roundedMinutes) : "Devam ediyor"}
      amount={entry.amount != null ? formatEUR(entry.amount) : undefined}
      status={{ label: entryStatusLabel(entry.status), tone: entryStatusTone(entry.status) }}
      editedNote={entry.status === "returned" && entry.returnNote ? `Not: ${entry.returnNote}` : entryEditedNote(entry)}
      onClick={editable ? () => setOpen(true) : undefined}
    />
  );

  if (!editable) return row;

  return (
    <>
      {row}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-sheet">
          <SheetHeader>
            <SheetTitle>{formatDayTR(entry.workDate)}</SheetTitle>
          </SheetHeader>
          <EditEntryForm
            entryId={entry.id}
            branchSlug={branchSlug}
            startAt={entry.startAt}
            endAt={entry.endAt}
            onSaved={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
