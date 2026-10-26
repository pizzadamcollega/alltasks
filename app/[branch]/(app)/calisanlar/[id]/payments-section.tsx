"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEUR } from "@/lib/money";
import { todayInAmsterdam } from "@/lib/time";
import {
  addPaymentAction,
  deletePaymentAction,
  setPaymentVisibilityAction,
} from "@/features/payments/actions";
import type { PaymentRecord } from "@/features/payments/queries";

export function PaymentsSection({
  userId,
  branchId,
  branchSlug,
  month,
  payments,
}: {
  userId: string;
  branchId: string;
  branchSlug: string;
  month: string;
  payments: PaymentRecord[];
}) {
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  function handleToggle(id: string, visible: boolean) {
    startTransition(async () => {
      const result = await setPaymentVisibilityAction(id, userId, branchSlug, visible);
      if (result.error) toast.error(result.error);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deletePaymentAction(id, userId, branchSlug);
      if (result.error) toast.error(result.error);
    });
  }

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const result = await addPaymentAction(userId, branchId, branchSlug, {
        kind: formData.get("kind"),
        amount: formData.get("amount"),
        month,
        paidOn: formData.get("paidOn"),
        note: formData.get("note") || undefined,
        visibleToEmployee: formData.get("visibleToEmployee") === "on",
      });
      if (result.error) toast.error(result.error);
      else setAdding(false);
    });
  }

  return (
    <Card className="rounded-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Ödemeler ve avanslar</CardTitle>
        <Button
          type="button"
          variant="ghost"
          className="gap-1 text-pz-accent"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="size-4" aria-hidden />
          {adding ? "Vazgeç" : "Ekle"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {payments.length === 0 ? (
          <p className="text-sm text-pz-muted">Henüz kayıt yok.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-pz-border p-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-pz-text">
                    {payment.kind === "advance" ? "Avans" : "Ödeme"} · {formatEUR(payment.amount)}
                  </span>
                  <span className="text-xs text-pz-muted">
                    {payment.paidOn}
                    {payment.note ? ` · ${payment.note}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-pz-muted">
                    <Switch
                      checked={payment.visibleToEmployee}
                      onCheckedChange={(checked) => handleToggle(payment.id, checked)}
                      aria-label={`Çalışana görünür: ${payment.kind === "advance" ? "Avans" : "Ödeme"} ${formatEUR(payment.amount)}`}
                    />
                    {payment.visibleToEmployee ? "Görünür" : "Gizli"}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-pz-bad"
                    onClick={() => handleDelete(payment.id)}
                  >
                    Sil
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <form action={handleAdd} className="flex flex-col gap-3 rounded-xl border border-pz-border p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kind">Tür</Label>
              <Select name="kind" defaultValue="advance">
                <SelectTrigger id="kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Avans</SelectItem>
                  <SelectItem value="payment">Ödeme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Tutar (€)</Label>
                <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paidOn">Tarih</Label>
                <Input id="paidOn" name="paidOn" type="date" defaultValue={todayInAmsterdam()} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note">Not (isteğe bağlı)</Label>
              <Textarea id="note" name="note" rows={2} maxLength={300} />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-pz-text">
              <Switch name="visibleToEmployee" />
              Çalışana görünür
            </label>
            <Button type="submit">Kaydet</Button>
          </form>
        ) : null}

        <p className="text-xs text-pz-muted">
          Görünürlüğü kapalı kayıtlar çalışanın ekranında hiç gösterilmez.
        </p>
      </CardContent>
    </Card>
  );
}
