import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BRANCHES, isKnownBranchSlug } from "@/lib/branches";
import { LogoTile } from "@/components/app/logo";

export default async function RootPage() {
  const cookieStore = await cookies();
  const lastBranch = cookieStore.get("pz_branch")?.value;

  if (lastBranch && isKnownBranchSlug(lastBranch)) {
    redirect(`/${lastBranch}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <LogoTile />
        <h1 className="text-2xl font-bold text-pz-text">Pizzadam</h1>
        <p className="text-sm text-pz-muted">Şubeni seç</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        {Object.entries(BRANCHES).map(([slug, branch]) => (
          <Link
            key={slug}
            href={`/${slug}/giris`}
            className="flex h-[52px] items-center justify-center rounded-[14px] border border-pz-border bg-pz-surface text-base font-semibold text-pz-text transition-colors hover:bg-pz-surface-2"
          >
            {branch.name}
          </Link>
        ))}
      </div>
    </main>
  );
}
