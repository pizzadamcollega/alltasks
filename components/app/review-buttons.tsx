"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cashierApproveAction, managerApproveAction, returnItemAction } from "@/features/review/actions";
import type { ReviewKind } from "@/types/database";

/**
 * "Geri gönder" (with a note) + "Onayla" for one record, as the kasacı or the
 * yönetici. The RPCs decide whether the step is allowed; `canApprove` only
 * hides a button that would be refused anyway.
 */
export function ReviewButtons({
  kind,
  id,
  branchSlug,
  as,
  canApprove,
  canReturn = true,
  ownerName,
}: {
  kind: ReviewKind;
  id: string;
  branchSlug: string;
  as: "cashier" | "manager";
  canApprove: boolean;
  canReturn?: boolean;
  ownerName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function approve() {
    startTransition(async () => {
      const action = as === "cashier" ? cashierApproveAction : managerApproveAction;
      const result = await action(kind, [id], branchSlug);
      if (result.error) toast.error(result.error);
      else if (!result.count) toast.error("Bu kayıt şu an onaylanamıyor.");
    });
  }

  function sendBack(formData: FormData) {
    startTransition(async () => {
      const result = await returnItemAction({ kind, id, note: formData.get("note") }, branchSlug);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${ownerName} kişisine geri gönderildi`);
        setOpen(false);
      }
    });
  }

  return (
    <div className="flex gap-2">
      {canReturn ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" disabled={pending} className="flex-1 border-pz-bad text-pz-bad">
              Geri gönder
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Geri gönder</DialogTitle>
              <DialogDescription>{ownerName} notu görecek, düzeltip tekrar gönderecek.</DialogDescription>
            </DialogHeader>
            <form action={sendBack} className="flex flex-col gap-3">
              <Label htmlFor={`note-${id}`}>Sebep</Label>
              <textarea
                id={`note-${id}`}
                name="note"
                required
                maxLength={300}
                rows={3}
                className="rounded-lg border border-pz-border bg-pz-surface px-3 py-2 text-base text-pz-text focus-visible:outline-2 focus-visible:outline-pz-accent"
              />
              <Button type="submit" disabled={pending}>
                {pending ? "Gönderiliyor…" : "Geri gönder"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {canApprove ? (
        <Button type="button" disabled={pending} onClick={approve} className="flex-1">
          Onayla
        </Button>
      ) : null}
    </div>
  );
}

/** "Hepsini onayla" for a list the screen already filtered to approvable ids. */
export function ApproveAllReviewButton({
  kind,
  ids,
  branchSlug,
  as,
  label,
}: {
  kind: ReviewKind;
  ids: string[];
  branchSlug: string;
  as: "cashier" | "manager";
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  if (ids.length === 0) return null;

  function approveAll() {
    startTransition(async () => {
      const action = as === "cashier" ? cashierApproveAction : managerApproveAction;
      const result = await action(kind, ids, branchSlug);
      if (result.error) toast.error(result.error);
      else toast.success(`${result.count ?? 0} kayıt onaylandı`);
    });
  }

  return (
    <Button type="button" disabled={pending} onClick={approveAll} className="h-12 w-full rounded-xl">
      {pending ? "Onaylanıyor…" : `${label} (${ids.length})`}
    </Button>
  );
}
