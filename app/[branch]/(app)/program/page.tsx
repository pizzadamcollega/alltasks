import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext } from "@/lib/session";
import { todayInAmsterdam, weekFromParam } from "@/lib/time";
import { getBranchEmployees } from "@/features/branch/queries";
import { getWeekShifts } from "@/features/shifts/queries";
import { WeekCalendar } from "@/components/app/week-calendar";
import { CopyWeekButton } from "./copy-week-button";

export default async function ProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ hafta?: string }>;
}) {
  const { branch: branchSlug } = await params;
  const { hafta } = await searchParams;
  const session = await requireSessionContext(branchSlug);
  if (!isManager(session.role)) redirect(`/${branchSlug}`);

  const today = todayInAmsterdam();
  const monday = weekFromParam(hafta, today);
  const supabase = await createClient();
  const [days, employees] = await Promise.all([
    getWeekShifts(supabase, session.branch.id, monday),
    getBranchEmployees(supabase, session.branch.id),
  ]);

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.4px] text-pz-accent">
          {session.branch.name}
        </span>
        <h1 className="text-[22px] font-bold text-pz-text">Program</h1>
        <p className="text-sm text-pz-muted">
          Saati değiştirmek için kutuya dokun; herkes ana sayfasında bu programı görür.
        </p>
      </div>
      <WeekCalendar
        days={days}
        today={today}
        monday={monday}
        basePath={`/${branchSlug}/program`}
        editor={{ branchId: session.branch.id, branchSlug, employees }}
        actions={<CopyWeekButton branchId={session.branch.id} branchSlug={branchSlug} monday={monday} />}
      />
    </div>
  );
}
