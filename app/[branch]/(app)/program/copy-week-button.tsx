"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyPreviousWeekAction } from "@/features/shifts/actions";

export function CopyWeekButton({
  branchId,
  branchSlug,
  monday,
}: {
  branchId: string;
  branchSlug: string;
  monday: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      className="h-11 gap-2 self-start"
      onClick={() =>
        startTransition(async () => {
          const result = await copyPreviousWeekAction(branchId, branchSlug, monday);
          if (result.error) toast.error(result.error);
          else if (result.copied) toast.success(`${result.copied} vardiya kopyalandı`);
          else toast.info("Kopyalanacak yeni vardiya yok");
        })
      }
    >
      <Copy className="size-4" aria-hidden />
      {pending ? "Kopyalanıyor…" : "Geçen haftayı kopyala"}
    </Button>
  );
}
