"use client";

import { Button } from "@/components/ui/button";
import { signOutAction } from "./actions";

export function SignOutButton({ branchSlug }: { branchSlug: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="border-pz-bad text-pz-bad hover:bg-pz-bad-soft"
      onClick={() => signOutAction(branchSlug)}
    >
      Çıkış yap
    </Button>
  );
}
