"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/app/status-chip";
import { amsterdamLocalToISO, formatDuration, formatTimeTR, isoToAmsterdamLocalInput } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { entryStatusLabel, entryStatusTone, entryEditedNote } from "@/features/entries/status";
import { approveEntriesAction, deleteEntryAction, managerUpdateEntryAction } from "@/features/entries/actions";
import type { ManagerEntryRow } from "@/features/entries/queries";

/** S9 Gün sonu onayı — one card per employee's entry for the day. */
export function ApprovalCard({
  entry,
  branchSlug,
}: {
  entry: ManagerEntryRow;
  branchSlug: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const missing = entry.status === "open" || entry.endAt === null;
  const canApprove = !missing && entry.status !== "approved";

  function handleApprove() {
    startTransition(async () => {
      const result = await approveEntriesAction([entry.id], branchSlug);
      if (result.error) toast.error(result.error);
    });
  }

  function handleDelete() {
    if (!window.confirm(`${entry.fullName} için bu kaydı silmek istediğine emin misin?`)) return;
    startTransition(async () => {
      const result = await deleteEntryAction(entry.id, branchSlug);
      if (result.error) toast.error(result.error);
    });
  }

  function handleSaveEdit(formData: FormData) {
    const startLocal = String(formData.get("startAt"));
    const endLocal = String(formData.get("endAt"));
    startTransition(async () => {
      const result = await managerUpdateEntryAction(
        entry.id,
        branchSlug,
        amsterdamLocalToISO(startLocal),
        amsterdamLocalToISO(endLocal),
      );
      if (result.error) toast.error(result.error);
      else setEditing(false);
    });
  }

  function handleFixEnd(formData: FormData) {
    const endTime = String(formData.get("endTime"));
    const endLocal = `${entry.workDate}T${endTime}`;
    startTransition(async () => {
      const result = await managerUpdateEntryAction(
        entry.id,
        branchSlug,
        entry.startAt,
        amsterdamLocalToISO(endLocal),
      );
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border bg-pz-surface p-4",
        missing ? "border-pz-bad" : "border-pz-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-pz-text">{entry.fullName}</span>
          {entry.hourlyRate != null ? (
            <span className="text-xs text-pz-muted">{formatEUR(entry.hourlyRate)} / saat</span>
          ) : null}
        </div>
        <StatusChip
          label={missing ? "Eksik" : entryStatusLabel(entry.status)}
          tone={missing ? "bad" : entryStatusTone(entry.status)}
        />
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[17px] font-bold tabular-nums text-pz-text">
            {formatTimeTR(entry.startAt)} – {entry.endAt ? formatTimeTR(entry.endAt) : "?"}
          </span>
          <span className="text-sm tabular-nums text-pz-muted">
            {entry.roundedMinutes != null ? formatDuration(entry.roundedMinutes) : "Bitirilmedi"}
          </span>
          {entryEditedNote(entry) ? (
            <span className="flex items-center gap-1 text-xs font-medium text-pz-warn">
              <Pencil className="size-3" aria-hidden />
              {entryEditedNote(entry)}
            </span>
          ) : null}
        </div>
        {entry.amount != null ? (
          <span className="text-[15px] font-bold tabular-nums text-pz-text">{formatEUR(entry.amount)}</span>
        ) : (
          <span className="text-[15px] font-bold text-pz-muted">–</span>
        )}
      </div>

      {missing ? (
        <form action={handleFixEnd} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={`end-${entry.id}`} className="text-xs font-medium text-pz-bad">
              Bitiş saati girilmedi
            </label>
            <Input
              id={`end-${entry.id}`}
              name="endTime"
              type="time"
              required
              className="h-11 border-pz-bad"
            />
          </div>
          <Button type="submit" disabled={pending} className="h-11">
            Kaydet
          </Button>
        </form>
      ) : editing ? (
        <form action={handleSaveEdit} className="flex flex-col gap-2 border-t border-pz-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`start-${entry.id}`} className="text-xs font-medium text-pz-muted">
                Başlangıç
              </label>
              <Input
                id={`start-${entry.id}`}
                name="startAt"
                type="datetime-local"
                defaultValue={isoToAmsterdamLocalInput(entry.startAt)}
                required
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`endEdit-${entry.id}`} className="text-xs font-medium text-pz-muted">
                Bitiş
              </label>
              <Input
                id={`endEdit-${entry.id}`}
                name="endAt"
                type="datetime-local"
                defaultValue={entry.endAt ? isoToAmsterdamLocalInput(entry.endAt) : undefined}
                required
                className="h-11"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={pending} className="flex-1">
              Kaydet
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-pz-bad text-pz-bad hover:bg-pz-bad-soft"
            disabled={pending}
            onClick={handleDelete}
          >
            Sil
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(true)}>
            Düzenle
          </Button>
          {entry.status === "approved" ? (
            <Button type="button" variant="outline" disabled className="flex-1 border-pz-ok text-pz-ok">
              Onaylandı ✓
            </Button>
          ) : (
            <Button type="button" disabled={!canApprove || pending} className="flex-1" onClick={handleApprove}>
              Onayla
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
