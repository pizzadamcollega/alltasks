"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveEntriesAction } from "@/features/entries/actions";

export function ApproveAllButton({
  entryIds,
  branchSlug,
}: {
  entryIds: string[];
  branchSlug: string;
}) {
  const [pending, startTransition] = useTransition();
  const allDone = entryIds.length === 0;

  function handleClick() {
    startTransition(async () => {
      const result = await approveEntriesAction(entryIds, branchSlug);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <Button
      type="button"
      disabled={allDone || pending}
      onClick={handleClick}
      className="h-[52px] w-full rounded-xl text-base"
    >
      {allDone ? "Tümü onaylandı" : pending ? "Onaylanıyor…" : `Kalan ${entryIds.length} kaydı onayla`}
    </Button>
  );
}
