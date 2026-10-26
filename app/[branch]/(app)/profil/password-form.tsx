"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type ActionResult } from "./actions";

const initialState: ActionResult = {};

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Mevcut şifre</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">Yeni şifre</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-pz-bad">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "Kaydediliyor…" : "Şifreyi değiştir"}
      </Button>
    </form>
  );
}
