"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DutyCheckboxes } from "@/components/app/duty-checkboxes";
import { setDutiesAction } from "@/features/accounts/actions";
import type { StaffDuty } from "@/types/database";

/** D-45: which screens this employee gets (kasacı / bezorgd / usta). */
export function DutiesCard({
  userId,
  branchSlug,
  duties,
}: {
  userId: string;
  branchSlug: string;
  duties: StaffDuty[];
}) {
  const [pending, startTransition] = useTransition();

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const result = await setDutiesAction(userId, branchSlug, formData.getAll("duties"));
      if (result.error) toast.error(result.error);
      else toast.success("Görevler kaydedildi");
    });
  }

  return (
    <Card className="rounded-card">
      <CardHeader>
        <CardTitle className="text-base">Görevler</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSave} className="flex flex-col gap-3">
          {duties.length === 0 ? (
            <p role="status" className="text-sm font-medium text-pz-warn">
              Görev atanmamış — en az bir görev seç.
            </p>
          ) : null}
          <DutyCheckboxes defaultValue={duties} />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Kaydediliyor…" : "Görevleri kaydet"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
