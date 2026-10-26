"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, type SignInResult } from "./actions";

const initialState: SignInResult = {};

export function LoginForm({ branchSlug }: { branchSlug: string }) {
  const [state, action, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <input type="hidden" name="branch" value={branchSlug} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Kullanıcı adı</Label>
        <Input
          id="username"
          name="username"
          placeholder="örnek: ahmet.yilmaz"
          autoComplete="username"
          required
          className="h-[52px] rounded-[14px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Şifre</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-[52px] rounded-[14px] pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-pz-muted"
          >
            {showPassword ? (
              <EyeOff className="size-5" aria-hidden />
            ) : (
              <Eye className="size-5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-pz-bad">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-[52px] rounded-[14px] text-base">
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}
