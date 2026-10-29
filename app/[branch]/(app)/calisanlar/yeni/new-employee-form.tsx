"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DutyCheckboxes } from "@/components/app/duty-checkboxes";
import { suggestUsername } from "@/lib/validation/username";
import { createEmployeeAction, type AccountActionResult } from "@/features/accounts/actions";
import type { BranchOption } from "@/features/accounts/queries";
import { todayInAmsterdam } from "@/lib/time";

const initialState: AccountActionResult = {};

/**
 * `branches` is only passed for an admin (SCREENS S14 "Şubeler: admin
 * checkboxes"); a patron's account always lands in their own branch.
 */
export function NewEmployeeForm({
  branchId,
  branchSlug,
  branches,
}: {
  branchId: string;
  branchSlug: string;
  branches?: BranchOption[];
}) {
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);

  async function action(
    _previous: AccountActionResult,
    formData: FormData,
  ): Promise<AccountActionResult> {
    return createEmployeeAction(branchSlug, {
      branchIds: branches ? formData.getAll("branchIds") : [branchId],
      fullName: formData.get("fullName"),
      username: formData.get("username"),
      password: formData.get("password"),
      hourlyRate: formData.get("hourlyRate"),
      startedOn: formData.get("startedOn"),
      duties: formData.getAll("duties"),
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
        <Input id="hourlyRate" name="hourlyRate" type="number" step="0.01" min="0.01" max="999.99" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="startedOn">Başlangıç tarihi</Label>
        <Input id="startedOn" name="startedOn" type="date" defaultValue={todayInAmsterdam()} required />
      </div>
      <DutyCheckboxes />
      {branches ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Şubeler</legend>
          {branches.map((branch) => (
            <label key={branch.id} className="flex min-h-11 items-center gap-3 text-sm text-pz-text">
              <input
                type="checkbox"
                name="branchIds"
                value={branch.id}
                defaultChecked={branch.id === branchId}
                className="size-5 accent-pz-accent"
              />
              {branch.name}
            </label>
          ))}
        </fieldset>
      ) : null}

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
