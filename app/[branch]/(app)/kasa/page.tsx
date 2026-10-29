import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasDuty, requireSessionContext } from "@/lib/session";
import { addDaysToDate, businessDay, formatDayTR, formatDuration, formatTimeTR } from "@/lib/time";
import { getBranchDayEntries } from "@/features/entries/queries";
import { entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { formatDough, getBranchDayMaterials } from "@/features/materials/queries";
import { getCashCount } from "@/features/cash/queries";
import { getMyCashierDays } from "@/features/shifts/queries";
import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/app/status-chip";
import { EmptyState } from "@/components/app/empty-state";
import { ApproveAllReviewButton, ReviewButtons } from "@/components/app/review-buttons";
import { CashCountForm } from "@/components/app/cash-count-form";

/**
 * D-48 Kasa — only for the day's kasacı: approve colleagues' hours and the
 * usta's material list (they then go to the yönetici with "Kasacı onayladı"),
 * and count the till. The kasacı's own hours skip this step (D-47).
 */
export default async function KasaPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ gun?: string }>;
}) {
  const { branch: branchSlug } = await params;
  const { gun } = await searchParams;
  const session = await requireSessionContext(branchSlug);
  if (!hasDuty(session, "kasaci")) redirect(`/${branchSlug}`);

  const supabase = await createClient();
  const { data: today } = await supabase.rpc("business_today", { p_branch: session.branch.id });
  const businessToday = today ?? businessDay(new Date());
  const day = gun && /^\d{4}-\d{2}-\d{2}$/.test(gun) && gun <= businessToday ? gun : businessToday;
  const [{ data: isCashier }, myDays] = await Promise.all([
    supabase.rpc("is_day_cashier", { p_branch: session.branch.id, p_date: day }),
    getMyCashierDays(supabase, session.branch.id, session.userId, addDaysToDate(businessToday, -31), businessToday),
  ]);

  // other days I was kasacı on: today, plus any older day that still has something waiting
  const dayLinks = myDays.filter((d) => d.date === businessToday || d.waiting > 0 || d.date === day);
  const dayNav =
    dayLinks.length > 1 || (dayLinks.length === 1 && dayLinks[0].date !== day) ? (
      <nav aria-label="Kasacı olduğun günler" className="flex flex-wrap gap-2">
        {dayLinks.map((d) => (
          <Link
            key={d.date}
            href={`/${branchSlug}/kasa?gun=${d.date}`}
            aria-current={d.date === day ? "page" : undefined}
            className={cn(
              "flex h-11 items-center rounded-chip border px-3 text-sm font-semibold",
              d.date === day ? "border-pz-accent bg-pz-accent-soft text-pz-accent" : "border-pz-border text-pz-text",
            )}
          >
            {d.date === businessToday ? "Bugün" : formatDayTR(d.date)}
            {d.waiting > 0 ? ` · ${d.waiting} bekliyor` : ""}
          </Link>
        ))}
      </nav>
    ) : null;

  if (!isCashier) {
    return (
      <div className="flex flex-col gap-4 pt-2 pb-6">
        <h1 className="text-[22px] font-bold text-pz-text">Kasa</h1>
        {dayNav}
        <EmptyState
          icon={Clock}
          title={day === businessToday ? "Bugün kasacı değilsin" : "Bu gün kasacı değildin"}
          description="Yönetici seni haftalık programda günün kasacısı yapınca bu ekran açılır."
        />
      </div>
    );
  }

  const [entries, materials, cash] = await Promise.all([
    getBranchDayEntries(supabase, session.branch.id, day),
    getBranchDayMaterials(supabase, session.branch.id, day),
    getCashCount(supabase, session.branch.id, day),
  ]);

  const approvableEntries = entries
    .filter((e) => e.status === "pending" && e.userId !== session.userId)
    .map((e) => e.id);
  const approvableMaterials = materials
    .filter((m) => m.status === "pending" && m.userId !== session.userId)
    .map((m) => m.id);

  return (
    <div className="flex flex-col gap-5 pt-2 pb-6">
      <div>
        <h1 className="text-[22px] font-bold text-pz-text">Kasa</h1>
        <p className="text-sm text-pz-muted">{formatDayTR(day)} · günün kasacısı sensin</p>
      </div>
      {dayNav}

      <section aria-labelledby="kasa-saatler" className="flex flex-col gap-2">
        <h2 id="kasa-saatler" className="text-base font-bold text-pz-text">
          Mesai saatleri
        </h2>
        {entries.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Bugün henüz kayıt yok" />
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => {
              const mine = entry.userId === session.userId;
              return (
                <li key={entry.id} className="flex flex-col gap-2 rounded-card border border-pz-border bg-pz-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-pz-text">
                        {entry.fullName}
                        {mine ? " (sen)" : ""}
                      </span>
                      <span className="text-[15px] font-bold tabular-nums text-pz-text">
                        {formatTimeTR(entry.startAt)} – {entry.endAt ? formatTimeTR(entry.endAt) : "devam ediyor"}
                      </span>
                      <span className="text-[13px] tabular-nums text-pz-muted">
                        {entry.roundedMinutes != null ? formatDuration(entry.roundedMinutes) : "Bitirilmedi"}
                      </span>
                    </div>
                    <StatusChip label={entryStatusLabel(entry.status)} tone={entryStatusTone(entry.status)} />
                  </div>
                  {entry.status === "returned" && entry.returnNote ? (
                    <p className="text-[13px] text-pz-bad">Not: {entry.returnNote}</p>
                  ) : null}
                  {mine ? (
                    <p className="text-[13px] text-pz-muted">Senin saatlerin doğrudan yönetici onayına gider.</p>
                  ) : entry.status === "pending" ? (
                    <ReviewButtons
                      kind="entry"
                      id={entry.id}
                      branchSlug={branchSlug}
                      as="cashier"
                      canApprove
                      ownerName={entry.fullName}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <ApproveAllReviewButton
          kind="entry"
          ids={approvableEntries}
          branchSlug={branchSlug}
          as="cashier"
          label="Bekleyen saatleri onayla"
        />
      </section>

      <section aria-labelledby="kasa-malzeme" className="flex flex-col gap-2">
        <h2 id="kasa-malzeme" className="text-base font-bold text-pz-text">
          Malzeme listesi
        </h2>
        {materials.length === 0 ? (
          <EmptyState icon={Package} title="Usta henüz malzeme listesi göndermedi" />
        ) : (
          <ul className="flex flex-col gap-2">
            {materials.map((report) => (
              <li key={report.id} className="flex flex-col gap-2 rounded-card border border-pz-border bg-pz-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-pz-text">{report.fullName}</span>
                  <StatusChip label={entryStatusLabel(report.status)} tone={entryStatusTone(report.status)} />
                </div>
                <p className="text-[15px] font-bold tabular-nums text-pz-text">
                  S {formatDough(report.doughS)} · M {formatDough(report.doughM)} · L {formatDough(report.doughL)}
                </p>
                {report.note ? <p className="whitespace-pre-line text-sm text-pz-text">{report.note}</p> : null}
                {report.status === "pending" && report.userId !== session.userId ? (
                  <ReviewButtons
                    kind="material"
                    id={report.id}
                    branchSlug={branchSlug}
                    as="cashier"
                    canApprove
                    ownerName={report.fullName}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <ApproveAllReviewButton
          kind="material"
          ids={approvableMaterials}
          branchSlug={branchSlug}
          as="cashier"
          label="Malzeme listesini onayla"
        />
      </section>

      <CashCountForm branchId={session.branch.id} branchSlug={branchSlug} workDate={day} count={cash} />
    </div>
  );
}
