"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR } from "@/lib/money";
import { formatDayTR } from "@/lib/time";
import { changeWageAction } from "@/features/wages/actions";
import type { WageRate } from "@/features/wages/queries";

export function WageCard({
  userId,
  branchSlug,
  history,
  defaultEffectiveFrom,
}: {
  userId: string;
  branchSlug: string;
  history: WageRate[];
  defaultEffectiveFrom: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = history[0] as WageRate | undefined;
  const past = history.slice(1);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await changeWageAction(
        userId,
        branchSlug,
        formData.get("hourlyRate"),
        formData.get("effectiveFrom"),
      );
      if (result.error) toast.error(result.error);
      else {
        toast.success("Ücret güncellendi");
        setOpen(false);
      }
    });
  }

  return (
    <Card className="rounded-card">
      <CardHeader>
        <CardTitle className="text-base">Saatlik ücret</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {current ? (
          <div>
            <div className="text-xl font-bold tabular-nums text-pz-text">
              {formatEUR(current.hourlyRate)}
            </div>
            <div className="text-xs text-pz-muted">{formatDayTR(current.effectiveFrom)}&apos;den beri</div>
          </div>
        ) : (
          <p className="text-sm text-pz-muted">Henüz ücret tanımlanmadı.</p>
        )}

        <Button type="button" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Vazgeç" : "Ücreti değiştir"}
        </Button>

        {open ? (
          <form action={handleSubmit} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="hourlyRate">Yeni ücret (€)</Label>
                <Input id="hourlyRate" name="hourlyRate" type="number" step="0.05" min="0.01" max="999.99" required />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="effectiveFrom">Geçerlilik tarihi</Label>
                <Input
                  id="effectiveFrom"
                  name="effectiveFrom"
                  type="date"
                  defaultValue={defaultEffectiveFrom}
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Kaydediliyor…" : "Yeni ücreti kaydet"}
            </Button>
            <p className="text-xs text-pz-muted">
              Geçmiş günler eski ücretle hesaplanmaya devam eder.
            </p>
          </form>
        ) : null}

        {past.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-pz-border pt-2">
            {past.map((h, idx) => {
              const newer = history[idx];
              const to = subDays(new Date(`${newer.effectiveFrom}T12:00:00Z`), 1)
                .toISOString()
                .slice(0, 10);
              return (
                <div key={h.id} className="flex justify-between text-xs text-pz-muted">
                  <span>
                    {h.effectiveFrom} – {to}
                  </span>
                  <span>{formatEUR(h.hourlyRate)} / saat</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
