"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/app/status-chip";
import { formatDuration, formatTimeTR, isoToAmsterdamLocalInput, manualEntryRange, todayInAmsterdam } from "@/lib/time";
import { ShiftRangeFields, readShiftRange } from "@/components/app/shift-range-fields";
import { TimePicker } from "@/components/app/time-picker";
import { formatEUR } from "@/lib/money";
import { entryStatusLabel, entryStatusTone, entryEditedNote } from "@/features/entries/status";
import { deleteEntryAction, managerUpdateEntryAction } from "@/features/entries/actions";
import { ReviewButtons } from "@/components/app/review-buttons";
import type { ManagerEntryRow } from "@/features/entries/queries";

/**
 * S9 Gün sonu onayı — one card per employee's entry for the day. D-46: the
 * yönetici approves after the kasacı (`cashierName`), or straight away for
 * the kasacı's own entry (`ownedByCashier`).
 */
export function ApprovalCard({
  entry,
  branchSlug,
  cashierName,
  ownedByCashier = false,
  locked = false,
}: {
  entry: ManagerEntryRow;
  branchSlug: string;
  /** Name of whoever gave the kasacı approval, when they did. */
  cashierName?: string;
  ownedByCashier?: boolean;
  /** The day is closed: show only, no buttons. */
  locked?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [fixEnd, setFixEnd] = useState("");
  const startLocal = isoToAmsterdamLocalInput(entry.startAt);
  const [pending, startTransition] = useTransition();
  const missing = entry.status === "open" || entry.endAt === null;
  const canApprove =
    !missing && (entry.status === "cashier_approved" || (entry.status === "pending" && ownedByCashier));

  function handleDelete() {
    if (!window.confirm(`${entry.fullName} için bu kaydı silmek istediğine emin misin?`)) return;
    startTransition(async () => {
      const result = await deleteEntryAction(entry.id, branchSlug);
      if (result.error) toast.error(result.error);
    });
  }

  function handleSaveEdit(formData: FormData) {
    const range = readShiftRange(formData);
    if (!range) return void toast.error("Başlangıç ve bitiş saatini seç.");
    startTransition(async () => {
      const result = await managerUpdateEntryAction(entry.id, branchSlug, range.startAt, range.endAt);
      if (result.error) toast.error(result.error);
      else setEditing(false);
    });
  }

  function handleFixEnd() {
    if (!fixEnd) return void toast.error("Bitiş saatini seç.");
    // same rule as hand entry: an end at/before the start time is the next day
    const { endAt } = manualEntryRange(startLocal.slice(0, 10), startLocal.slice(11, 16), fixEnd);
    startTransition(async () => {
      const result = await managerUpdateEntryAction(entry.id, branchSlug, entry.startAt, endAt);
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
          {cashierName && (entry.status === "cashier_approved" || entry.status === "approved") ? (
            <span className="text-xs font-medium text-pz-info">Kasacı onayladı · {cashierName}</span>
          ) : entry.status === "pending" && !ownedByCashier ? (
            <span className="text-xs font-medium text-pz-warn">Kasacı onayı bekliyor</span>
          ) : entry.status === "pending" && ownedByCashier ? (
            <span className="text-xs font-medium text-pz-muted">Kasacının kendi saati — doğrudan sende</span>
          ) : null}
          {entry.status === "returned" && entry.returnNote ? (
            <span className="text-xs font-medium text-pz-bad">Geri gönderildi: {entry.returnNote}</span>
          ) : null}
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

      {locked ? null : missing ? (
        <form action={handleFixEnd} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={`end-${entry.id}`} className="text-xs font-medium text-pz-bad">
              Bitiş saati girilmedi
            </label>
            <TimePicker
              id={`end-${entry.id}`}
              label="Bitiş"
              value={fixEnd}
              onChange={setFixEnd}
              size="sm"
              invalid
            />
          </div>
          <Button type="submit" disabled={pending} className="h-11">
            Kaydet
          </Button>
        </form>
      ) : editing ? (
        <form action={handleSaveEdit} className="flex flex-col gap-2 border-t border-pz-border pt-3">
          <ShiftRangeFields
            idPrefix={`approve-${entry.id}`}
            today={todayInAmsterdam()}
            defaultDate={startLocal.slice(0, 10)}
            defaultStart={startLocal.slice(11, 16)}
            defaultEnd={entry.endAt ? isoToAmsterdamLocalInput(entry.endAt).slice(11, 16) : ""}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={pending} className="flex-1">
              Kaydet
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
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
          </div>
          {entry.status === "approved" ? (
            <Button type="button" variant="outline" disabled className="border-pz-ok text-pz-ok">
              Onaylandı ✓
            </Button>
          ) : entry.status === "returned" ? null : (
            <ReviewButtons
              kind="entry"
              id={entry.id}
              branchSlug={branchSlug}
              as="manager"
              canApprove={canApprove}
              ownerName={entry.fullName}
            />
          )}
        </div>
      )}
    </div>
  );
}
