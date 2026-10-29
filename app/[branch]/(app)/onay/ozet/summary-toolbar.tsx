"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Pencil, Printer, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { closeDayAction, reopenDayAction } from "@/features/day-close/actions";

/**
 * D-49 toolbar. "Kapat" on an unsaved, complete day asks first ("kaydet
 * uyarısı"); leaving the page the browser way gets the same warning.
 */
export function SummaryToolbar({
  branchId,
  branchSlug,
  day,
  saved,
  canSave,
}: {
  branchId: string;
  branchSlug: string;
  day: string;
  saved: boolean;
  canSave: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const unsaved = canSave && !saved;
  const backHref = `/${branchSlug}/onay?gun=${day}`;

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function save(thenLeave: boolean) {
    startTransition(async () => {
      const result = await closeDayAction(branchId, branchSlug, day);
      if (result.error) return void toast.error(result.error);
      toast.success("Gün kaydedildi ve kapatıldı");
      setConfirmOpen(false);
      if (thenLeave) router.push(backHref);
    });
  }

  function reopen() {
    startTransition(async () => {
      const result = await reopenDayAction(branchId, branchSlug, day);
      if (result.error) return void toast.error(result.error);
      toast.success("Gün düzenleme için açıldı");
      router.push(backHref);
    });
  }

  function close() {
    if (unsaved) setConfirmOpen(true);
    else router.push(backHref);
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {saved ? (
        <Button type="button" variant="outline" disabled={pending} onClick={reopen} className="h-11 gap-1.5">
          <Pencil className="size-4" aria-hidden />
          Düzenle
        </Button>
      ) : (
        <Button type="button" disabled={!canSave || pending} onClick={() => save(false)} className="h-11 gap-1.5">
          <Save className="size-4" aria-hidden />
          {pending ? "Kaydediliyor…" : "Kaydet ve kapat"}
        </Button>
      )}
      <Button type="button" variant="outline" onClick={() => window.print()} className="h-11 gap-1.5">
        <Printer className="size-4" aria-hidden />
        Yazdır
      </Button>
      <Button asChild variant="outline" className="h-11 gap-1.5">
        <a href={`/${branchSlug}/onay/ozet/pdf?gun=${day}`} download>
          <Download className="size-4" aria-hidden />
          PDF indir
        </a>
      </Button>
      <Button type="button" variant="ghost" onClick={close} className="h-11 gap-1.5">
        <X className="size-4" aria-hidden />
        Kapat
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gün kaydedilmedi</DialogTitle>
            <DialogDescription>
              Kapatmadan önce kaydetmek ister misin? Kaydedince gün kilitlenir; sonra &quot;Düzenle&quot; ile açabilirsin.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setConfirmOpen(false);
                router.push(backHref);
              }}
            >
              Kaydetmeden çık
            </Button>
            <Button type="button" className="flex-1" disabled={pending} onClick={() => save(true)}>
              Kaydet ve kapat
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
