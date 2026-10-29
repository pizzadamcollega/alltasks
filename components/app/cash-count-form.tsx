"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/app/status-chip";
import { formatEUR } from "@/lib/money";
import { entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { saveCashCountAction } from "@/features/cash/actions";
import { cashTotal, parseEuroInput } from "@/features/cash/validation";
import type { CashCount } from "@/features/cash/queries";

const TAKINGS = [
  { key: "online", label: "Online" },
  { key: "kiosk", label: "Kiosk" },
  { key: "contant", label: "Contant" },
] as const;

type Key = "openingFloat" | (typeof TAKINGS)[number]["key"];

const toInput = (n: number | undefined) => (n ? String(n).replace(".", ",") : "");

/** D-48 kasacı: count the till, enter the three takings, send to the yönetici. */
export function CashCountForm({
  branchId,
  branchSlug,
  workDate,
  count,
}: {
  branchId: string;
  branchSlug: string;
  workDate: string;
  count: CashCount | null;
}) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<Key, string>>({
    openingFloat: toInput(count?.openingFloat),
    online: toInput(count?.online),
    kiosk: toInput(count?.kiosk),
    contant: toInput(count?.contant),
  });
  const locked = count?.status === "approved";
  const total = cashTotal({
    online: parseEuroInput(values.online),
    kiosk: parseEuroInput(values.kiosk),
    contant: parseEuroInput(values.contant),
  });

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await saveCashCountAction(branchId, branchSlug, {
        workDate,
        ...values,
        note: formData.get("note") ?? "",
      });
      if (result.error) toast.error(result.error);
      else toast.success("Kasa sayımı yönetici onayına gönderildi");
    });
  }

  const field = (key: Key, label: string) => (
    <div key={key} className="flex flex-col gap-1.5">
      <Label htmlFor={`cash-${key}`}>{label} (€)</Label>
      <Input
        id={`cash-${key}`}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        disabled={locked}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        className="h-11 text-right text-base tabular-nums"
      />
    </div>
  );

  return (
    <Card className="rounded-card">
      <CardContent className="pt-4">
        <form action={save} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-pz-text">
              <Wallet className="size-4 text-pz-accent" aria-hidden />
              Kasa sayımı
            </h2>
            {count ? <StatusChip label={entryStatusLabel(count.status)} tone={entryStatusTone(count.status)} /> : null}
          </div>
          {count?.status === "returned" && count.returnNote ? (
            <p role="alert" className="rounded-lg bg-pz-bad-soft px-3 py-2 text-sm text-pz-bad">
              Geri gönderildi: {count.returnNote}
            </p>
          ) : null}

          {field("openingFloat", "Kasa açılış parası")}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{TAKINGS.map((t) => field(t.key, t.label))}</div>

          <div className="flex items-center justify-between rounded-xl bg-pz-surface-2 px-3 py-2.5">
            <span className="text-sm font-semibold text-pz-text">Toplam (online + kiosk + contant)</span>
            <span aria-live="polite" className="text-lg font-bold tabular-nums text-pz-text">
              {formatEUR(total)}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cash-note">Not</Label>
            <textarea
              id="cash-note"
              name="note"
              rows={2}
              maxLength={500}
              disabled={locked}
              defaultValue={count?.note ?? ""}
              placeholder="örn. kasa 5€ eksik"
              className="rounded-lg border border-pz-border bg-pz-surface px-3 py-2 text-base text-pz-text focus-visible:outline-2 focus-visible:outline-pz-accent"
            />
          </div>

          {locked ? (
            <p className="text-sm text-pz-muted">Yönetici onayladı, artık değiştirilemez.</p>
          ) : (
            <Button type="submit" disabled={pending} className="h-[52px] rounded-xl text-base">
              {pending ? "Gönderiliyor…" : count ? "Güncelle ve tekrar gönder" : "Yöneticiye gönder"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
