"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { formatDayTR } from "@/lib/time";
import { ShiftRangeFields, readShiftRange } from "@/components/app/shift-range-fields";
import { createManualEntryAction, type EntryActionResult } from "@/features/entries/actions";
import type { BranchEmployee } from "@/features/branch/queries";

const initialState: EntryActionResult = {};

export function AddEntryForm({
  branchId,
  branchSlug,
  employees,
  day,
  today,
}: {
  branchId: string;
  branchSlug: string;
  employees: BranchEmployee[];
  /** The Onay day being viewed — a new entry always lands on it. */
  day: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);

  async function action(
    _previous: EntryActionResult,
    formData: FormData,
  ): Promise<EntryActionResult> {
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return { error: "Bir çalışan seç." };
    const range = readShiftRange(formData);
    if (!range) return { error: "Başlangıç ve bitiş saatini seç." };
    const result = await createManualEntryAction(branchId, branchSlug, userId, range.startAt, range.endAt);
    if (!result.error) setOpen(false);
    return result;
  }

  const [state, formAction, pending] = useActionState(action, initialState);

  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-12 gap-2 rounded-xl" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Kayıt ekle
      </Button>
    );
  }

  return (
    <Card className="rounded-card">
      <CardContent className="pt-4">
        <form action={formAction} className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-pz-text">{formatDayTR(day)} · kayıt ekle</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="userId">Çalışan</Label>
            <Select name="userId">
              <SelectTrigger id="userId" className="h-12 w-full text-base">
                <SelectValue placeholder="Çalışan seç" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.userId} value={employee.userId}>
                    {employee.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ShiftRangeFields idPrefix="add" today={today} defaultDate={day} showDate={false} />
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-pz-bad">
              {state.error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={pending} className="h-12 flex-1">
              {pending ? "Ekleniyor…" : "Ekle"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
