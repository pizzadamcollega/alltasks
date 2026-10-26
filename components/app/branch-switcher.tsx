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
      <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-semibold text-pz-text">
        {currentName}
        <ChevronDown className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Object.entries(BRANCHES).map(([slug, branch]) => (
          <DropdownMenuItem key={slug} asChild>
            <Link href={`/${slug}`}>{branch.name}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
