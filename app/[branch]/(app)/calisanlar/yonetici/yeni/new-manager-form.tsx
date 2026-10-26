"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestUsername } from "@/lib/validation/username";
import { createManagerAction, type AccountActionResult } from "@/features/accounts/actions";
import type { BranchOption } from "@/features/accounts/queries";

const initialState: AccountActionResult = {};

export function NewManagerForm({
  branchId,
  branchSlug,
  branches,
}: {
  branchId: string;
  branchSlug: string;
  branches: BranchOption[];
}) {
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);

  async function action(
    _previous: AccountActionResult,
    formData: FormData,
  ): Promise<AccountActionResult> {
    return createManagerAction(branchSlug, {
      fullName: formData.get("fullName"),
      username: formData.get("username"),
      password: formData.get("password"),
      branchId: formData.get("branchId"),
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
        <Input id="password" name="password" type="text" minLength={8} required placeholder="en az 8 karakter" />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Şube</legend>
        {branches.map((branch) => (
          <label key={branch.id} className="flex min-h-11 items-center gap-3 text-sm text-pz-text">
            <input
              type="radio"
              name="branchId"
              value={branch.id}
              defaultChecked={branch.id === branchId}
              required
              className="size-5 accent-pz-accent"
            />
            {branch.name}
          </label>
        ))}
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-pz-bad">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-[52px] rounded-xl text-base">
        {pending ? "Oluşturuluyor…" : "Yöneticiyi oluştur"}
      </Button>
    </form>
  );
}
