"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Minus, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/app/status-chip";
import { entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { saveMaterialReportAction } from "@/features/materials/actions";
import { formatDough, type MaterialReport } from "@/features/materials/queries";

const SIZES = [
  { key: "doughS", label: "S" },
  { key: "doughM", label: "M" },
  { key: "doughL", label: "L" },
] as const;

type Counts = Record<(typeof SIZES)[number]["key"], number>;

function clamp(n: number) {
  return Math.max(-999, Math.min(999, Math.trunc(n) || 0));
}

/**
 * D-47 usta "Eksik / fazla malzeme": dough per size (+ fazla, − eksik) and a
 * free-text note for anything else; goes to the kasacı, then the yönetici.
 */
export function MaterialCard({
  branchId,
  branchSlug,
  workDate,
  report,
}: {
  branchId: string;
  branchSlug: string;
  workDate: string;
  report: MaterialReport | null;
}) {
  const [pending, startTransition] = useTransition();
  const [counts, setCounts] = useState<Counts>({
    doughS: report?.doughS ?? 0,
    doughM: report?.doughM ?? 0,
    doughL: report?.doughL ?? 0,
  });
  const locked = report?.status === "cashier_approved" || report?.status === "approved";

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await saveMaterialReportAction(branchId, branchSlug, {
        workDate,
        ...counts,
        note: formData.get("note") ?? "",
      });
      if (result.error) toast.error(result.error);
      else toast.success("Malzeme listesi kasacı onayına gönderildi");
    });
  }

  return (
    <Card className="rounded-card">
      <CardContent className="pt-4">
        <form action={save} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-pz-text">
              <Package className="size-4 text-pz-accent" aria-hidden />
              Eksik / fazla malzeme
            </h2>
            {report ? (
              <StatusChip label={entryStatusLabel(report.status)} tone={entryStatusTone(report.status)} />
            ) : null}
          </div>
          {report?.status === "returned" && report.returnNote ? (
            <p role="alert" className="rounded-lg bg-pz-bad-soft px-3 py-2 text-sm text-pz-bad">
              Geri gönderildi: {report.returnNote}
            </p>
          ) : null}
          <p className="text-[13px] text-pz-muted">Hamur: fazlaysa +, eksikse − yaz.</p>

          <div className="grid grid-cols-3 gap-2">
            {SIZES.map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1 rounded-xl border border-pz-border p-2">
                <Label htmlFor={`dough-${key}`} className="text-sm font-bold">
                  Hamur {label}
                </Label>
                <input
                  id={`dough-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={-999}
                  max={999}
                  step={1}
                  disabled={locked}
                  value={counts[key]}
                  onChange={(e) => setCounts((c) => ({ ...c, [key]: clamp(Number(e.target.value)) }))}
                  className="h-11 w-full rounded-lg border border-pz-border bg-pz-surface text-center text-lg font-bold tabular-nums text-pz-text"
                />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={locked}
                    aria-label={`Hamur ${label} azalt`}
                    onClick={() => setCounts((c) => ({ ...c, [key]: clamp(c[key] - 1) }))}
                    className="size-11"
                  >
                    <Minus className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={locked}
                    aria-label={`Hamur ${label} artır`}
                    onClick={() => setCounts((c) => ({ ...c, [key]: clamp(c[key] + 1) }))}
                    className="size-11"
                  >
                    <Plus className="size-4" aria-hidden />
                  </Button>
                </div>
                <span className="text-xs text-pz-muted">
                  {counts[key] > 0 ? "fazla" : counts[key] < 0 ? "eksik" : "tamam"} {formatDough(counts[key])}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material-note">Diğer eksikler / not</Label>
            <textarea
              id="material-note"
              name="note"
              rows={3}
              maxLength={500}
              disabled={locked}
              defaultValue={report?.note ?? ""}
              placeholder="örn. mozzarella az, kutu L bitti"
              className="rounded-lg border border-pz-border bg-pz-surface px-3 py-2 text-base text-pz-text focus-visible:outline-2 focus-visible:outline-pz-accent"
            />
          </div>

          {locked ? (
            <p className="text-sm text-pz-muted">Onaylandı, artık değiştirilemez.</p>
          ) : (
            <Button type="submit" disabled={pending} className="h-[52px] rounded-xl text-base">
              {pending ? "Gönderiliyor…" : report ? "Güncelle ve tekrar gönder" : "Onaya gönder"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
