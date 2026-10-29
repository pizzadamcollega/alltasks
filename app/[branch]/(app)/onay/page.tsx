import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, format } from "date-fns";
import { CheckCircle2, Lock, Package, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext } from "@/lib/session";
import { formatDayTR, formatDuration, todayInAmsterdam } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { getBranchEmployees } from "@/features/branch/queries";
import { getDaySummary } from "@/features/day-close/queries";
import { entryStatusLabel, entryStatusTone } from "@/features/entries/status";
import { formatDough } from "@/features/materials/queries";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { ApprovalCard } from "@/components/app/approval-card";
import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";
import { ApproveAllReviewButton, ReviewButtons } from "@/components/app/review-buttons";
import { AddEntryForm } from "./add-entry-form";
import { SummaryPrompt } from "./summary-prompt";

/**
 * S9 Gün sonu onayı (D-46..D-49): hours, the usta's material list and the
 * kasacı's cash count for one day. Hours and material arrive "Kasacı
 * onayladı"; once everything is green the day summary opens.
 */
export default async function OnayPage({
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

  const supabase = await createClient();
  const today = todayInAmsterdam();
  const yesterday = format(addDays(new Date(`${today}T12:00:00Z`), -1), "yyyy-MM-dd");
  const day = gun && /^\d{4}-\d{2}-\d{2}$/.test(gun) ? gun : yesterday;
  const isToday = day === today;
  const prevDay = format(addDays(new Date(`${day}T12:00:00Z`), -1), "yyyy-MM-dd");
  const nextDay = format(addDays(new Date(`${day}T12:00:00Z`), 1), "yyyy-MM-dd");

  const [summary, employees] = await Promise.all([
    getDaySummary(supabase, session.branch, day),
    getBranchEmployees(supabase, session.branch.id),
  ]);
  const { entries, materials, cash, cashier, names, closing } = summary;
  const locked = Boolean(closing?.closed);
  const cashierId = cashier?.userId;

  const approvedCount = entries.filter((e) => e.status === "approved").length;
  const approvableEntryIds = entries
    .filter(
      (e) =>
        e.endAt !== null &&
        (e.status === "cashier_approved" || (e.status === "pending" && e.userId === cashierId)),
    )
    .map((e) => e.id);
  const approvableMaterialIds = materials
    .filter((m) => m.status === "cashier_approved" || (m.status === "pending" && m.userId === cashierId))
    .map((m) => m.id);
  const summaryHref = `/${branchSlug}/onay/ozet?gun=${day}`;

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold text-pz-text">Gün sonu onayı</h1>
        <Link href={`/${branchSlug}/onay/gecmis`} className="flex h-11 items-center text-sm font-semibold text-pz-accent">
          Kapatılan günler
        </Link>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Link
          href={`?gun=${prevDay}`}
          aria-label="Önceki gün"
          className="flex size-11 items-center justify-center rounded-full text-pz-text hover:bg-pz-surface-2"
        >
          ‹
        </Link>
        <span className="min-w-[180px] rounded-chip bg-pz-surface-2 px-4 py-2 text-center text-sm font-semibold text-pz-text">
          {formatDayTR(day)}
        </span>
        <Link
          href={isToday ? "#" : `?gun=${nextDay}`}
          aria-label="Sonraki gün"
          aria-disabled={isToday}
          className={
            isToday
              ? "flex size-11 items-center justify-center rounded-full text-pz-muted"
              : "flex size-11 items-center justify-center rounded-full text-pz-text hover:bg-pz-surface-2"
          }
        >
          ›
        </Link>
      </div>

      <p className="text-center text-sm text-pz-muted">
        Günün kasacısı: <span className="font-semibold text-pz-text">{cashier?.fullName ?? "atanmadı"}</span>
        {cashier ? null : (
          <>
            {" · "}
            <Link href={`/${branchSlug}/program?hafta=${day}`} className="font-semibold text-pz-accent">
              Programda ata
            </Link>
          </>
        )}
      </p>

      {locked ? (
        <Link
          href={summaryHref}
          className="flex min-h-14 items-center gap-3 rounded-card border-2 border-pz-ok bg-pz-ok-soft px-3 py-2"
        >
          <Lock className="size-5 shrink-0 text-pz-ok" aria-hidden />
          <span className="flex flex-col">
            <span className="text-sm font-bold text-pz-ok">Gün kapatıldı</span>
            <span className="text-[13px] text-pz-text">Özeti gör, yazdır, PDF indir veya düzenlemek için aç</span>
          </span>
        </Link>
      ) : summary.complete ? (
        <>
          <Link
            href={summaryHref}
            className="flex min-h-14 items-center justify-center rounded-xl bg-pz-ok px-3 text-base font-bold text-pz-surface"
          >
            Tüm onaylar tamam — Gün sonu özeti
          </Link>
          <SummaryPrompt href={summaryHref} day={day} />
        </>
      ) : (
        <ul aria-label="Kalan işler" className="flex flex-col gap-1 rounded-card border border-pz-border bg-pz-surface p-3 text-sm text-pz-text">
          {summary.blockers.map((b) => (
            <li key={b}>• {b}</li>
          ))}
        </ul>
      )}

      <section aria-label="Günün özeti">
        <StatGrid>
          <StatCard label="Onaylanan" value={`${approvedCount} / ${entries.length}`} />
          <StatCard label="Toplam saat" value={formatDuration(summary.totals.minutes)} />
          <StatCard label="Gider" value={formatEUR(summary.totals.cost)} />
          <StatCard label="Kasa toplamı" value={cash ? formatEUR(cash.total) : "—"} />
        </StatGrid>
        <p className="pt-2 text-xs text-pz-muted">
          Toplamlara bitirilmemiş kayıt dahil değil. Süreler 5 dakikaya yuvarlandı.
        </p>
      </section>

      <section aria-labelledby="onay-saatler" className="flex flex-col gap-3">
        <h2 id="onay-saatler" className="text-base font-bold text-pz-text">
          Mesai saatleri
        </h2>
        {entries.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Bu gün için kayıt yok" />
        ) : (
          entries.map((entry) => (
            <ApprovalCard
              key={entry.id}
              entry={entry}
              branchSlug={branchSlug}
              cashierName={entry.cashierApprovedBy ? names[entry.cashierApprovedBy] : undefined}
              ownedByCashier={entry.userId === cashierId}
              locked={locked}
            />
          ))
        )}
        {locked ? null : (
          <>
            <ApproveAllReviewButton
              kind="entry"
              ids={approvableEntryIds}
              branchSlug={branchSlug}
              as="manager"
              label="Kasacının onayladığı saatleri onayla"
            />
            <AddEntryForm
              branchId={session.branch.id}
              branchSlug={branchSlug}
              employees={employees}
              day={day}
              today={today}
            />
          </>
        )}
      </section>

      <section aria-labelledby="onay-malzeme" className="flex flex-col gap-2">
        <h2 id="onay-malzeme" className="flex items-center gap-2 text-base font-bold text-pz-text">
          <Package className="size-4 text-pz-accent" aria-hidden />
          Eksik / fazla malzeme
        </h2>
        {materials.length === 0 ? (
          <p className="text-sm text-pz-muted">Bu gün için malzeme listesi yok.</p>
        ) : (
          materials.map((report) => (
            <div key={report.id} className="flex flex-col gap-2 rounded-card border border-pz-border bg-pz-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-pz-text">{report.fullName}</span>
                <StatusChip label={entryStatusLabel(report.status)} tone={entryStatusTone(report.status)} />
              </div>
              <p className="text-[15px] font-bold tabular-nums text-pz-text">
                Hamur S {formatDough(report.doughS)} · M {formatDough(report.doughM)} · L {formatDough(report.doughL)}
              </p>
              {report.note ? <p className="whitespace-pre-line text-sm text-pz-text">{report.note}</p> : null}
              {report.cashierApprovedBy ? (
                <span className="text-xs font-medium text-pz-info">
                  Kasacı onayladı · {names[report.cashierApprovedBy] ?? "—"}
                </span>
              ) : report.status === "pending" && report.userId !== cashierId ? (
                <span className="text-xs font-medium text-pz-warn">Kasacı onayı bekliyor</span>
              ) : null}
              {report.status === "returned" && report.returnNote ? (
                <span className="text-xs font-medium text-pz-bad">Geri gönderildi: {report.returnNote}</span>
              ) : null}
              {!locked && report.status !== "approved" && report.status !== "returned" ? (
                <ReviewButtons
                  kind="material"
                  id={report.id}
                  branchSlug={branchSlug}
                  as="manager"
                  canApprove={approvableMaterialIds.includes(report.id)}
                  ownerName={report.fullName}
                />
              ) : null}
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="onay-kasa" className="flex flex-col gap-2">
        <h2 id="onay-kasa" className="flex items-center gap-2 text-base font-bold text-pz-text">
          <Wallet className="size-4 text-pz-accent" aria-hidden />
          Kasa sayımı
        </h2>
        {!cash ? (
          <p className="text-sm text-pz-muted">Kasacı henüz kasa sayımını göndermedi.</p>
        ) : (
          <div className="flex flex-col gap-2 rounded-card border border-pz-border bg-pz-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-pz-text">{cash.cashierName ?? "—"}</span>
              <StatusChip label={entryStatusLabel(cash.status)} tone={entryStatusTone(cash.status)} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
              <dt className="text-pz-muted">Açılış parası</dt>
              <dd className="text-right text-pz-text">{formatEUR(cash.openingFloat)}</dd>
              <dt className="text-pz-muted">Online</dt>
              <dd className="text-right text-pz-text">{formatEUR(cash.online)}</dd>
              <dt className="text-pz-muted">Kiosk</dt>
              <dd className="text-right text-pz-text">{formatEUR(cash.kiosk)}</dd>
              <dt className="text-pz-muted">Contant</dt>
              <dd className="text-right text-pz-text">{formatEUR(cash.contant)}</dd>
              <dt className="font-bold text-pz-text">Toplam</dt>
              <dd className="text-right font-bold text-pz-text">{formatEUR(cash.total)}</dd>
            </dl>
            {cash.note ? <p className="whitespace-pre-line text-sm text-pz-text">Not: {cash.note}</p> : null}
            {cash.status === "returned" && cash.returnNote ? (
              <span className="text-xs font-medium text-pz-bad">Geri gönderildi: {cash.returnNote}</span>
            ) : null}
            {!locked && cash.status === "pending" ? (
              <ReviewButtons
                kind="cash"
                id={cash.id}
                branchSlug={branchSlug}
                as="manager"
                canApprove
                ownerName={cash.cashierName ?? "Kasacı"}
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
