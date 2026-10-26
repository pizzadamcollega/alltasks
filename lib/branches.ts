/**
 * Static branch directory for the public login page, which runs before any
 * session exists and so cannot rely on RLS-protected `branches` reads
 * (docs/SPEC.md §1.2). Only two branches exist; if a third is added, add it
 * here too — see docs/DECISIONS.md.
 */
export const BRANCHES = {
  "de-pijp": { name: "Pizzadam De Pijp" },
  zuid: { name: "Pizzadam Zuid" },
} as const;

export type BranchSlug = keyof typeof BRANCHES;

export function isKnownBranchSlug(slug: string): slug is BranchSlug {
  return slug in BRANCHES;
}
