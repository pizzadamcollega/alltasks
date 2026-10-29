import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext } from "@/lib/session";
import { getDaySummary } from "@/features/day-close/queries";
import { DaySummaryView } from "@/components/app/day-summary-view";
import { SummaryToolbar } from "./summary-toolbar";

/** D-49 Gün sonu özeti: save (locks the day), print, edit (reopen), PDF. */
export default async function GunSonuOzetiPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ gun?: string }>;
}) {
  const { branch: branchSlug } = await params;
  const { gun } = await searchParams;
  const session = await requireSessionContext(branchSlug);
  if (!isManager(session.role)) redirect(`/${branchSlug}`);
  if (!gun || !/^\d{4}-\d{2}-\d{2}$/.test(gun)) redirect(`/${branchSlug}/onay`);

  const supabase = await createClient();
  const summary = await getDaySummary(supabase, session.branch, gun);
  const saved = Boolean(summary.closing?.closed);

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/${branchSlug}/onay?gun=${gun}`} className="flex h-11 items-center text-sm font-semibold text-pz-accent">
          ‹ Gün sonu onayı
        </Link>
      </div>

      {!summary.complete && !saved ? (
        <ul
          aria-label="Kaydetmeden önce"
          className="flex flex-col gap-1 rounded-card border border-pz-warn/40 bg-pz-warn-soft p-3 text-sm text-pz-warn print:hidden"
        >
          {summary.blockers.map((b) => (
            <li key={b}>• {b}</li>
          ))}
        </ul>
      ) : null}

      <SummaryToolbar
        branchId={session.branch.id}
        branchSlug={branchSlug}
        day={gun}
        saved={saved}
        canSave={summary.complete}
      />

      <DaySummaryView summary={summary} />
    </div>
  );
}
