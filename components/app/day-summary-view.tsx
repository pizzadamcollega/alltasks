import { formatDayTR, formatDuration, formatTimeTR } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { formatDough } from "@/features/materials/queries";
import type { DaySummary } from "@/features/day-close/queries";

const th = "px-2 py-1.5 text-left text-xs font-semibold text-pz-muted";
const td = "px-2 py-1.5 text-sm text-pz-text tabular-nums";

/**
 * D-49 Gün sonu özeti — one printable sheet: who worked when (and who
 * approved it), material shortages, the cash count. Pure markup, so the
 * screen and the print view are the same thing.
 */
export function DaySummaryView({ summary }: { summary: DaySummary }) {
  const { entries, materials, cash, names, totals, closing } = summary;
  const name = (id: string | null) => (id ? (names[id] ?? "—") : "—");

  return (
    <article className="flex flex-col gap-5 rounded-card border border-pz-border bg-pz-surface p-4 print:border-0 print:p-0">
      <header className="flex flex-col gap-0.5">
        <h2 className="text-lg font-bold text-pz-text">Gün sonu özeti</h2>
        <p className="text-sm text-pz-muted">
          {summary.branchName} · {formatDayTR(summary.day, true)} · Kasacı: {summary.cashier?.fullName ?? "—"}
        </p>
        <p className="text-sm font-semibold text-pz-text">
          {closing?.closed
            ? `Kaydedildi · ${closing.closedByName ?? "—"} · ${formatDayTR(closing.closedAt.slice(0, 10))} ${formatTimeTR(closing.closedAt)}`
            : "Henüz kaydedilmedi"}
        </p>
      </header>

      <section aria-label="Mesai saatleri" className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-pz-text">Mesai saatleri</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-b border-pz-border">
                <th className={th}>Çalışan</th>
                <th className={th}>Saat</th>
                <th className={th}>Süre</th>
                <th className={`${th} text-right`}>Tutar</th>
                <th className={th}>Kasacı onayı</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-pz-border/60">
                  <td className={td}>{e.fullName}</td>
                  <td className={td}>
                    {formatTimeTR(e.startAt)} – {e.endAt ? formatTimeTR(e.endAt) : "?"}
                  </td>
                  <td className={td}>{e.roundedMinutes != null ? formatDuration(e.roundedMinutes) : "—"}</td>
                  <td className={`${td} text-right`}>{e.amount != null ? formatEUR(e.amount) : "—"}</td>
                  <td className={td}>{e.cashierApprovedBy ? name(e.cashierApprovedBy) : "kendi saati"}</td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td className={td} colSpan={5}>
                    Kayıt yok
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${td} font-bold`} colSpan={2}>
                  Toplam
                </td>
                <td className={`${td} font-bold`}>{formatDuration(totals.minutes)}</td>
                <td className={`${td} text-right font-bold`}>{formatEUR(totals.cost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-label="Malzeme" className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-pz-text">Eksik / fazla malzeme</h3>
        {materials.length === 0 ? (
          <p className="text-sm text-pz-muted">Malzeme listesi gönderilmedi.</p>
        ) : (
          <>
            <p className="text-sm font-semibold tabular-nums text-pz-text">
              Hamur toplamı: S {formatDough(totals.doughS)} · M {formatDough(totals.doughM)} · L{" "}
              {formatDough(totals.doughL)}
            </p>
            <ul className="flex flex-col gap-1.5">
              {materials.map((m) => (
                <li key={m.id} className="text-sm text-pz-text">
                  <span className="font-semibold">{m.fullName}</span>: S {formatDough(m.doughS)} · M{" "}
                  {formatDough(m.doughM)} · L {formatDough(m.doughL)}
                  {m.note ? <span className="block whitespace-pre-line text-pz-muted">{m.note}</span> : null}
                  <span className="block text-xs text-pz-muted">
                    Kasacı: {m.cashierApprovedBy ? name(m.cashierApprovedBy) : "—"} · Yönetici: {name(m.approvedBy)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-label="Kasa" className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-pz-text">Kasa sayımı</h3>
        {!cash ? (
          <p className="text-sm text-pz-muted">Kasa sayımı girilmedi.</p>
        ) : (
          <dl className="grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt className="text-pz-muted">Kasacı</dt>
            <dd className="text-right text-pz-text">{cash.cashierName ?? "—"}</dd>
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
            <dt className="text-pz-muted">Onaylayan</dt>
            <dd className="text-right text-pz-text">{name(cash.approvedBy)}</dd>
            {cash.note ? (
              <>
                <dt className="text-pz-muted">Not</dt>
                <dd className="whitespace-pre-line text-right text-pz-text">{cash.note}</dd>
              </>
            ) : null}
          </dl>
        )}
      </section>
    </article>
  );
}
