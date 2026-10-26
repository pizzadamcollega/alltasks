"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck, Inbox, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDayShortTR, TR_WEEKDAYS, weekDates } from "@/lib/time";
import {
  approvePendingRequestsAction,
  decideShiftRequestAction,
  setWeekPublishedAction,
} from "@/features/shifts/actions";
import type { ShiftRequestRow } from "@/features/shifts/queries";
import { StatusChip } from "./status-chip";
import { TimePicker } from "./time-picker";

const STATUS = {
  pending: { label: "Bekliyor", tone: "warn" },
  approved: { label: "Onaylandı", tone: "ok" },
  rejected: { label: "Reddedildi", tone: "bad" },
} as const;

/**
 * Manager side of "Haftalık program": every employee's requests for the week,
 * grouped by day. Onayla puts the person on the board below, the time button
 * approves at another start time, Reddet takes them off again.
 */
export function ShiftRequestsPanel({
  branchId,
  branchSlug,
  monday,
  requests,
}: {
  branchId: string;
  branchSlug: string;
  monday: string;
  requests: ShiftRequestRow[];
}) {
  const [pending, startTransition] = useTransition();
  const waiting = requests.filter((r) => r.status === "pending").length;

  function decide(request: ShiftRequestRow, approve: boolean, startTime?: string) {
    startTransition(async () => {
      const result = await decideShiftRequestAction(branchSlug, {
        requestId: request.id,
        approve,
        startTime,
      });
      if (result.error) toast.error(result.error);
      else toast.success(`${request.fullName}: ${approve ? "onaylandı" : "reddedildi"}`);
    });
  }

  function approveAll() {
    startTransition(async () => {
      const result = await approvePendingRequestsAction(branchId, branchSlug, monday);
      if (result.error) toast.error(result.error);
      else toast.success(`${result.count ?? 0} istek onaylandı`);
    });
  }

  return (
    <section aria-labelledby="requests-title" className="flex flex-col gap-3 rounded-card border border-pz-border bg-pz-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="requests-title" className="text-base font-bold text-pz-text">
            Gelen istekler
          </h2>
          <p className="text-sm text-pz-muted">
            {requests.length === 0
              ? "Bu hafta için henüz istek yok."
              : waiting > 0
                ? `${waiting} istek onay bekliyor`
                : "Hepsi karara bağlandı"}
          </p>
        </div>
        {waiting > 0 ? (
          <Button type="button" variant="outline" disabled={pending} onClick={approveAll} className="h-11 gap-2">
            <CheckCheck className="size-4" aria-hidden />
            Hepsini onayla
          </Button>
        ) : null}
      </div>

      {requests.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-pz-surface-2 p-3 text-sm text-pz-muted">
          <Inbox className="size-4 shrink-0" aria-hidden />
          Çalışanlar &quot;Haftalık program&quot; sayfasından gün isteği gönderir.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {weekDates(monday).map((date, index) => {
            const dayRequests = requests.filter((r) => r.workDate === date);
            if (dayRequests.length === 0) return null;
            return (
              <li key={date} className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.4px] text-pz-muted">
                  {TR_WEEKDAYS[index]} · {formatDayShortTR(date)}
                </h3>
                <ul className="flex flex-col divide-y divide-pz-border rounded-xl border border-pz-border">
                  {dayRequests.map((request) => (
                    <li key={request.id} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-pz-text">{request.fullName}</span>
                        <StatusChip {...STATUS[request.status]} />
                      </div>
                      {request.note ? (
                        <p className="text-[13px] text-pz-muted sm:max-w-48 sm:truncate" title={request.note}>
                          “{request.note}”
                        </p>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <div className="w-[6.5rem]">
                          <TimePicker
                            id={`req-${request.id}`}
                            label={`${request.fullName} başlangıç saati`}
                            value={request.startTime}
                            onChange={(value) => decide(request, true, value)}
                            size="sm"
                          />
                        </div>
                        {request.status !== "approved" ? (
                          <Button type="button" disabled={pending} onClick={() => decide(request, true)} className="h-11 flex-1 sm:flex-none">
                            Onayla
                          </Button>
                        ) : null}
                        {request.status !== "rejected" ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={() => decide(request, false)}
                            className="h-11 flex-1 sm:flex-none"
                          >
                            Reddet
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** "Programı yayınla": a future week stays a draft (hidden from employees) until this. */
export function PublishWeekBar({
  branchId,
  branchSlug,
  monday,
  published,
  shiftCount,
}: {
  branchId: string;
  branchSlug: string;
  monday: string;
  published: boolean;
  shiftCount: number;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setWeekPublishedAction(branchId, branchSlug, monday, !published);
      if (result.error) toast.error(result.error);
      else toast.success(published ? "Program yayından kaldırıldı" : "Program yayınlandı, herkes görebilir");
    });
  }

  return (
    <div
      className={
        published
          ? "flex flex-col gap-2 rounded-card border border-pz-ok/40 bg-pz-ok-soft p-3 sm:flex-row sm:items-center sm:justify-between"
          : "flex flex-col gap-2 rounded-card border border-pz-warn/40 bg-pz-warn-soft p-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <p className="text-sm text-pz-text">
        {published
          ? "Yayınlandı — çalışanlar bu haftanın programını görüyor. Değişiklikler anında görünür."
          : `Taslak — çalışanlar bu haftayı henüz görmüyor. Programda ${shiftCount} vardiya var.`}
      </p>
      <Button
        type="button"
        variant={published ? "outline" : "default"}
        disabled={pending || (!published && shiftCount === 0)}
        onClick={toggle}
        className="h-11 shrink-0 gap-2"
      >
        <Megaphone className="size-4" aria-hidden />
        {published ? "Yayından kaldır" : "Programı yayınla"}
      </Button>
    </div>
  );
}
