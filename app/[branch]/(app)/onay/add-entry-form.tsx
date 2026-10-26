"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { amsterdamLocalToISO } from "@/lib/time";
import { createManualEntryAction, type EntryActionResult } from "@/features/entries/actions";
import type { BranchEmployee } from "@/features/branch/queries";

const initialState: EntryActionResult = {};

export function AddEntryForm({
  branchId,
  branchSlug,
  employees,
}: {
  branchId: string;
  branchSlug: string;
  employees: BranchEmployee[];
}) {
  const [open, setOpen] = useState(false);

  async function action(
    _previous: EntryActionResult,
    formData: FormData,
  ): Promise<EntryActionResult> {
    const userId = String(formData.get("userId"));
    const startLocal = String(formData.get("startAt"));
    const endLocal = String(formData.get("endAt"));
    if (!userId) return { error: "Bir çalışan seç." };
    const result = await createManualEntryAction(
      branchId,
      branchSlug,
      userId,
      amsterdamLocalToISO(startLocal),
      amsterdamLocalToISO(endLocal),
    );
    if (!result.error) setOpen(false);
    return result;
  }

  const [state, formAction, pending] = useActionState(action, initialState);

  if (!open) {
    return (
      <Button type="button" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Kayıt ekle
      </Button>
    );
  }

  return (
    <Card className="rounded-card">
      <CardContent className="pt-4">
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="userId">Çalışan</Label>
            <Select name="userId">
              <SelectTrigger id="userId" className="w-full">
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
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newStartAt">Başlangıç</Label>
              <Input id="newStartAt" name="startAt" type="datetime-local" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newEndAt">Bitiş</Label>
              <Input id="newEndAt" name="endAt" type="datetime-local" required />
            </div>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-pz-bad">
              {state.error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "Ekleniyor…" : "Ekle"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
