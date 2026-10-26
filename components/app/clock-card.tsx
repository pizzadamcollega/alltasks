"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clockInAction, clockOutAction } from "@/features/clock/actions";

export type ClockState =
  | { kind: "idle" }
  | { kind: "running"; startAt: string }
  | { kind: "otherBranch" };

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** S2 ClockCard — Başla/Bitir with a live HH:MM:SS timer (DESIGN.md §4). */
export function ClockCard({
  branchId,
  branchSlug,
  state,
}: {
  branchId: string;
  branchSlug: string;
  state: ClockState;
}) {
  const [elapsed, setElapsed] = useState("00:00:00");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.kind !== "running") return;
    const start = new Date(state.startAt).getTime();
    const tick = () => setElapsed(formatElapsed(Date.now() - start));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state]);

  function handleStart() {
    startTransition(async () => {
      const result = await clockInAction(branchId, branchSlug);
      if (result.error) toast.error(result.error);
    });
  }

  function handleStop() {
    startTransition(async () => {
      const result = await clockOutAction(branchSlug);
      if (result.error) toast.error(result.error);
      else toast.success("Mesai bitti · onay bekliyor");
    });
  }

  return (
    <div
      aria-label="Mesai"
      className="flex items-center justify-between gap-4 rounded-card border border-pz-border bg-pz-surface p-4"
    >
      <div className="flex flex-col gap-1">
        {state.kind === "running" ? (
          <>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-pz-ok">
              <span className="size-2 rounded-full bg-pz-ok" aria-hidden />
              Mesaide
            </span>
            <span className="text-[30px] font-bold tabular-nums tracking-tight text-pz-text">
              {elapsed}
            </span>
          </>
        ) : state.kind === "otherBranch" ? (
          <span className="text-sm font-semibold text-pz-muted">Diğer şubede mesaidesin</span>
        ) : (
          <span className="text-sm font-semibold text-pz-muted">Mesaide değilsin</span>
        )}
      </div>

      {state.kind === "running" ? (
        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-xl border-pz-bad px-6 text-pz-bad hover:bg-pz-bad-soft"
          disabled={pending}
          onClick={handleStop}
        >
          Bitir
        </Button>
      ) : state.kind === "idle" ? (
        <Button type="button" className="h-12 rounded-xl px-6" disabled={pending} onClick={handleStart}>
          Başla
        </Button>
      ) : null}
    </div>
  );
}
