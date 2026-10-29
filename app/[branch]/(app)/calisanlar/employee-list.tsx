"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/app/status-chip";
import { formatDuration } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import type { EmployeeListRow } from "@/features/accounts/queries";
import { dutyList } from "@/features/duties/labels";

export function EmployeeList({
  employees,
  branchSlug,
}: {
  employees: EmployeeListRow[];
  branchSlug: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.fullName.toLowerCase().includes(q) || e.username.toLowerCase().includes(q),
    );
  }, [employees, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-pz-muted" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara…"
          aria-label="Çalışan ara"
          className="h-11 pl-9"
        />
      </div>

      <div className="divide-y divide-pz-border rounded-card border border-pz-border bg-pz-surface px-3">
        {filtered.map((employee) => (
          <Link
            key={employee.userId}
            href={`/${branchSlug}/calisanlar/${employee.userId}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-pz-text">{employee.fullName}</span>
              <span className="text-[13px] text-pz-muted">
                {employee.username}
                {employee.duties.length > 0 ? ` · ${dutyList(employee.duties)}` : " · görev yok"}
                {employee.hourlyRate != null ? ` · ${formatEUR(employee.hourlyRate)} / saat` : ""}
                {employee.monthMinutes > 0 ? ` · ${formatDuration(employee.monthMinutes)}` : ""}
              </span>
            </div>
            <StatusChip
              label={employee.active ? "Aktif" : "Pasif"}
              tone={employee.active ? "ok" : "neutral"}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
