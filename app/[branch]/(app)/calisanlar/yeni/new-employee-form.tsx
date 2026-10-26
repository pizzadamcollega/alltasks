"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestUsername } from "@/lib/validation/username";
import { createEmployeeAction, type AccountActionResult } from "@/features/accounts/actions";
import { todayInAmsterdam } from "@/lib/time";

const initialState: AccountActionResult = {};

export function NewEmployeeForm({ branchId, branchSlug }: { branchId: string; branchSlug: string }) {
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);

  async function action(
    _previous: AccountActionResult,
    formData: FormData,
  ): Promise<AccountActionResult> {
    return createEmployeeAction(branchId, branchSlug, {
      fullName: formData.get("fullName"),
      username: formData.get("username"),
      password: formData.get("password"),
      hourlyRate: formData.get("hourlyRate"),
      startedOn: formData.get("startedOn"),
    });
  }

  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Ad soyad</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          onChange={(e) => {
            if (!usernameTouched) setUsername(suggestUsername(e.target.value));
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Kullanıcı adı</Label>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(e) => {
            setUsernameTouched(true);
            setUsername(e.target.value);
          }}
          placeholder="ad.soyad"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Geçici şifre</Label>
        <Input id="password" name="password" type="text" minLength={8} required defaultValue="" placeholder="en az 8 karakter" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hourlyRate">Saatlik ücret (€)</Label>
        <Input id="hourlyRate" name="hourlyRate" type="number" step="0.05" min="0.01" max="999.99" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="startedOn">Başlangıç tarihi</Label>
        <Input id="startedOn" name="startedOn" type="date" defaultValue={todayInAmsterdam()} required />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-pz-bad">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-[52px] rounded-xl text-base">
        {pending ? "Oluşturuluyor…" : "Hesabı oluştur"}
      </Button>
    </form>
  );
}
