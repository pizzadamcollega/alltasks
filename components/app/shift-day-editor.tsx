"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteShiftAction, upsertShiftAction } from "@/features/shifts/actions";
import type { ShiftDay } from "@/features/shifts/queries";
import type { BranchEmployee } from "@/features/branch/queries";

const DEFAULT_START = "16:45";

/** Program (manager): one day's rows — change a start time in place, remove, or add someone. */
export function ShiftDayEditor({
  day,
  branchId,
  branchSlug,
  employees,
}: {
  day: ShiftDay;
  branchId: string;
  branchSlug: string;
  employees: BranchEmployee[];
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  const onDay = new Set(day.shifts.map((s) => s.userId));
  const available = employees.filter((e) => !onDay.has(e.userId));
  const lastStart = day.shifts.at(-1)?.startTime ?? DEFAULT_START;

  function save(userId: string, startTime: string, onDone?: () => void) {
    startTransition(async () => {
      const result = await upsertShiftAction(branchId, branchSlug, {
        userId,
        workDate: day.date,
        startTime,
      });
      if (result.error) toast.error(result.error);
      else onDone?.();
    });
  }

  function remove(shiftId: string, name: string) {
    startTransition(async () => {
      const result = await deleteShiftAction(shiftId, branchSlug);
      if (result.error) toast.error(result.error);
      else toast.success(`${name} programdan çıkarıldı`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {day.shifts.length === 0 ? <p className="text-[13px] text-pz-muted">Program yok</p> : null}
      <ul className="flex flex-col gap-1.5">
        {day.shifts.map((shift) => (
          <li key={shift.id} className="flex items-center gap-2">
            <Input
              type="time"
              aria-label={`${shift.fullName} başlangıç saati`}
              defaultValue={shift.startTime}
              disabled={pending}
              onBlur={(e) => {
                if (e.target.value && e.target.value !== shift.startTime) save(shift.userId, e.target.value);
              }}
              className="h-11 w-[6.5rem] shrink-0 bg-pz-surface text-base tabular-nums"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-pz-text">{shift.fullName}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${shift.fullName} programdan çıkar`}
              disabled={pending}
              onClick={() => remove(shift.id, shift.fullName)}
              className="size-11 shrink-0 text-pz-muted hover:text-pz-bad"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="flex flex-col gap-2 rounded-xl border border-pz-border bg-pz-surface p-2"
          action={(formData) => {
            const userId = String(formData.get("userId") ?? "");
            if (!userId) return void toast.error("Bir çalışan seç.");
            save(userId, String(formData.get("startTime")), () => setAdding(false));
          }}
        >
          <select
            name="userId"
            aria-label="Çalışan"
            defaultValue=""
            required
            className="h-11 rounded-lg border border-pz-border bg-pz-surface px-2 text-base text-pz-text"
          >
            <option value="" disabled>
              Çalışan seç
            </option>
            {available.map((employee) => (
              <option key={employee.userId} value={employee.userId}>
                {employee.fullName}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Input
              name="startTime"
              type="time"
              aria-label="Başlangıç saati"
              defaultValue={lastStart}
              required
              className="h-11 flex-1 text-base tabular-nums"
            />
            <Button type="submit" disabled={pending} className="h-11">
              Ekle
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => setAdding(false)}>
              Vazgeç
            </Button>
          </div>
        </form>
      ) : available.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setAdding(true)}
          className="h-11 gap-1.5 bg-pz-surface"
        >
          <Plus className="size-4" aria-hidden />
          Kişi ekle
        </Button>
      ) : null}
    </div>
  );
}
