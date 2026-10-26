import Link from "next/link";
import { StatusChip } from "@/components/app/status-chip";
import type { ManagerListRow } from "@/features/accounts/queries";

export function ManagerList({
  managers,
  branchSlug,
}: {
  managers: ManagerListRow[];
  branchSlug: string;
}) {
  return (
    <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
      {managers.map((manager) => (
        <Link
          key={manager.userId}
          href={`/${branchSlug}/calisanlar/yonetici/${manager.userId}`}
          className="flex items-center justify-between gap-3 py-2.5"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-pz-text">{manager.fullName}</span>
            <span className="text-[13px] text-pz-muted">
              {manager.username}
              {manager.branchNames.length > 0 ? ` · ${manager.branchNames.join(", ")}` : ""}
            </span>
          </div>
          <StatusChip
            label={manager.active ? "Aktif" : "Pasif"}
            tone={manager.active ? "ok" : "neutral"}
          />
        </Link>
      ))}
    </div>
  );
}
