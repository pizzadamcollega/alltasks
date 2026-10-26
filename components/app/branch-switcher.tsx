import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BRANCHES } from "@/lib/branches";

/** Admin-only (ARCHITECTURE.md §4): admin has no single branch, so it needs a switcher. */
export function BranchSwitcher({ currentSlug }: { currentSlug: string }) {
  const currentName = BRANCHES[currentSlug as keyof typeof BRANCHES]?.name ?? currentSlug;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-11 items-center gap-1 rounded-xl px-1 text-sm font-semibold text-pz-text">
        {currentName}
        <ChevronDown className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Object.entries(BRANCHES).map(([slug, branch]) => (
          <DropdownMenuItem key={slug} asChild className="min-h-11">
            <Link href={`/${slug}`}>{branch.name}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
