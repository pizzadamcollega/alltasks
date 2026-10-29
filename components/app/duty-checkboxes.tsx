import { DUTIES, dutyLabel } from "@/features/duties/labels";
import type { StaffDuty } from "@/types/database";

const HINTS: Record<StaffDuty, string> = {
  kasaci: "Saatleri ve malzemeyi onaylar, kasayı sayar",
  bezorgd: "Mesai başlangıç ve bitiş saatini girer",
  usta: "Mesai saati ve eksik/fazla malzeme girer",
};

/** D-45 duty picker; posts as repeated `duties` fields. At least one is required (checked on submit). */
export function DutyCheckboxes({ defaultValue = [] }: { defaultValue?: StaffDuty[] }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1.5 text-sm font-medium">Görevler</legend>
      {DUTIES.map((duty) => (
        <label key={duty} className="flex min-h-11 items-center gap-3 text-sm text-pz-text">
          <input
            type="checkbox"
            name="duties"
            value={duty}
            defaultChecked={defaultValue.includes(duty)}
            className="size-5 accent-pz-accent"
          />
          <span className="flex flex-col">
            <span className="font-medium">{dutyLabel(duty)}</span>
            <span className="text-xs text-pz-muted">{HINTS[duty]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
