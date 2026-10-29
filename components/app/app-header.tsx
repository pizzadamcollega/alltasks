import Link from "next/link";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { BranchSwitcher } from "@/components/app/branch-switcher";
import type { AppRole } from "@/types/database";

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * The persistent top strip shared by every authenticated screen — just
 * identity + theme. Each page owns its own heading/greeting below this,
 * since that content differs too much per screen (SCREENS.md) to force
 * into one generic title prop.
 */
export function AppHeader({
  branch,
  fullName,
  role,
}: {
  branch: string;
  fullName: string;
  role: AppRole;
}) {
  return (
    <header className="flex items-center justify-between gap-1 px-4 pt-3 print:hidden lg:px-6">
      {role === "admin" ? <BranchSwitcher currentSlug={branch} /> : <span />}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Link
          href={`/${branch}/profil`}
          aria-label="Profil"
          className="flex size-11 items-center justify-center rounded-full bg-pz-accent-soft text-sm font-bold text-pz-accent"
        >
          {initials(fullName) || "?"}
        </Link>
      </div>
    </header>
  );
}
