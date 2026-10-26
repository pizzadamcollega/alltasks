"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPasswordAction, setActiveAction } from "@/features/accounts/actions";

export function AccountSection({
  userId,
  branchSlug,
  active,
}: {
  userId: string;
  branchSlug: string;
  active: boolean;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleReset(formData: FormData) {
    startTransition(async () => {
      const result = await resetPasswordAction(userId, branchSlug, formData.get("newPassword"));
      if (result.error) toast.error(result.error);
      else {
        toast.success("Şifre sıfırlandı");
        setResetOpen(false);
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await setActiveAction(userId, branchSlug, !active);
      if (result.error) toast.error(result.error);
      else toast.success(active ? "Hesap pasife alındı" : "Hesap aktifleştirildi");
    });
  }

  return (
    <Card className="rounded-card">
      <CardHeader>
        <CardTitle className="text-base">Hesap</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              Şifreyi sıfırla
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni şifre</DialogTitle>
            </DialogHeader>
            <form action={handleReset} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newPassword">Yeni şifre</Label>
                <Input id="newPassword" name="newPassword" type="text" minLength={8} required />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Kaydediliyor…" : "Şifreyi sıfırla"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={handleToggleActive}
          className={
            active
              ? "border-pz-bad text-pz-bad hover:bg-pz-bad-soft"
              : "border-pz-ok text-pz-ok hover:bg-pz-ok-soft"
          }
        >
          {active ? "Hesabı pasife al" : "Hesabı aktifleştir"}
        </Button>
      </CardContent>
    </Card>
  );
}
