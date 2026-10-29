"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * D-49: the moment the last approval lands, the summary asks to be opened.
 * Shown once per day per browser tab, so coming back to Onay doesn't nag.
 */
export function SummaryPrompt({ href, day }: { href: string; day: string }) {
  const key = `pz-summary-${day}`;
  // the server can't see sessionStorage: render closed there, read it on the client
  const seen = useSyncExternalStore(
    noopSubscribe,
    () => readSeen(key),
    () => true,
  );
  const [dismissed, setDismissed] = useState(false);
  const open = !seen && !dismissed;

  function dismiss(next: boolean) {
    if (next) return;
    setDismissed(true);
    try {
      sessionStorage.setItem(key, "seen");
    } catch {
      // private mode: just show it again next time
    }
  }

  return (
    <Dialog open={open} onOpenChange={dismiss}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tüm onaylar tamam</DialogTitle>
          <DialogDescription>
            Saatler, malzeme listesi ve kasa sayımı onaylandı. Gün sonu özetini açıp kaydedebilirsin.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="flex-1" onClick={() => dismiss(false)}>
            Sonra
          </Button>
          <Button asChild className="flex-1">
            <Link href={href} onClick={() => dismiss(false)}>
              Özeti aç
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function noopSubscribe() {
  return () => {};
}

function readSeen(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
}
