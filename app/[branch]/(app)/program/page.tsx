import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext, type SessionContext } from "@/lib/session";
import { addDaysToDate, todayInAmsterdam, weekFromParam, weekStart } from "@/lib/time";
import { getBranchEmployees } from "@/features/branch/queries";
import { getWeekPublication, getWeekRequests, getWeekShifts } from "@/features/shifts/queries";
import { PublishBadge, WeekCalendar, WeekNav } from "@/components/app/week-calendar";
import { ShiftRequestForm } from "@/components/app/shift-request-form";
import { PublishWeekBar, ShiftRequestsPanel } from "@/components/app/shift-requests-panel";
import { CopyWeekButton } from "./copy-week-button";

/** Employees may ask for the next 8 weeks (mirrors `submit_shift_requests`). */
const REQUEST_WEEKS_AHEAD = 8;
/** How far back an employee can page through the board. */
const PAST_WEEKS = 8;

export default async function ProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ hafta?: string }>;
}) {
  const [{ branch: branchSlug }, { hafta }] = await Promise.all([params, searchParams]);
  const session = await requireSessionContext(branchSlug);

  return isManager(session.role) ? (
    <ManagerProgram session={session} hafta={hafta} />
  ) : (
    <EmployeeProgram session={session} hafta={hafta} />
  );
}

function PageTitle({ branchName, sub }: { branchName: string; sub: string }) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-[0.4px] text-pz-accent">{branchName}</span>
      <h1 className="text-[22px] font-bold text-pz-text">Haftalık program</h1>
      <p className="text-sm text-pz-muted">{sub}</p>
    </div>
  );
}

async function EmployeeProgram({ session, hafta }: { session: SessionContext; hafta?: string }) {
  const { branch, userId } = session;
  const today = todayInAmsterdam();
  const thisMonday = weekStart(today);
  const nextMonday = addDaysToDate(thisMonday, 7);
  const firstMonday = addDaysToDate(thisMonday, -7 * PAST_WEEKS);
  const lastMonday = addDaysToDate(nextMonday, 7 * (REQUEST_WEEKS_AHEAD - 1));
  const asked = weekFromParam(hafta, nextMonday);
  const monday = asked < firstMonday ? firstMonday : asked > lastMonday ? lastMonday : asked;

  const supabase = await createClient();
  const [requests, publication] = await Promise.all([
    getWeekRequests(supabase, branch.id, monday),
    getWeekPublication(supabase, branch.id, monday),
  ]);
  // this week and earlier are always visible (shifts_select); later weeks once published
  const days = monday <= thisMonday || publication ? await getWeekShifts(supabase, branch.id, monday) : null;
  const basePath = `/${branch.slug}/program`;

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <PageTitle
        branchName={branch.name}
        sub="Çalışabileceğin günleri seç ve onaya gönder. Patron onaylayıp yayınlayınca program ana sayfanda görünür."
      />
      {days ? (
        <WeekCalendar
          days={days}
          today={today}
          monday={monday}
          basePath={basePath}
          currentUserId={userId}
          badge={monday > thisMonday ? <PublishBadge published /> : null}
          minMonday={firstMonday}
          maxMonday={lastMonday}
        />
      ) : (
        <section aria-label="Program isteği" className="flex flex-col gap-3">
          <WeekNav
            monday={monday}
            today={today}
            basePath={basePath}
            title="Program isteğim"
            homeMonday={nextMonday}
            minMonday={firstMonday}
            maxMonday={lastMonday}
          />
          <ShiftRequestForm key={monday} branchId={branch.id} branchSlug={branch.slug} monday={monday} requests={requests} />
        </section>
      )}
    </div>
  );
}

async function ManagerProgram({ session, hafta }: { session: SessionContext; hafta?: string }) {
  const { branch } = session;
  const today = todayInAmsterdam();
  const monday = weekFromParam(hafta, today);
  const isFutureWeek = monday > weekStart(today);

  const supabase = await createClient();
  const [days, employees, requests, publication] = await Promise.all([
    getWeekShifts(supabase, branch.id, monday),
    getBranchEmployees(supabase, branch.id),
    getWeekRequests(supabase, branch.id, monday),
    getWeekPublication(supabase, branch.id, monday),
  ]);
  const shiftCount = days.reduce((sum, day) => sum + day.shifts.length, 0);

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <PageTitle
        branchName={branch.name}
        sub="Gelen istekleri onayla veya saatini değiştir, programı düzenle, sonra yayınla."
      />
      <WeekCalendar
        days={days}
        today={today}
        monday={monday}
        basePath={`/${branch.slug}/program`}
        badge={isFutureWeek ? <PublishBadge published={Boolean(publication)} /> : null}
        editor={{ branchId: branch.id, branchSlug: branch.slug, employees }}
        actions={
          <div className="flex flex-col gap-3">
            {isFutureWeek ? (
              <PublishWeekBar
                branchId={branch.id}
                branchSlug={branch.slug}
                monday={monday}
                published={Boolean(publication)}
                shiftCount={shiftCount}
              />
            ) : null}
            {isFutureWeek || requests.length > 0 ? (
              <ShiftRequestsPanel branchId={branch.id} branchSlug={branch.slug} monday={monday} requests={requests} />
            ) : null}
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-pz-text">Nihai program</h2>
                <p className="text-sm text-pz-muted">Onaylanan istekler buraya düşer; saate dokunup değiştirebilirsin.</p>
              </div>
              <CopyWeekButton branchId={branch.id} branchSlug={branch.slug} monday={monday} />
            </div>
          </div>
        }
      />
    </div>
  );
}
