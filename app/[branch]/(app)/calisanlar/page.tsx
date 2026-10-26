import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext } from "@/lib/session";
import { monthStart, todayInAmsterdam } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getEmployeeList, getManagerList } from "@/features/accounts/queries";
import { EmptyState } from "@/components/app/empty-state";
import { EmployeeList } from "./employee-list";
import { ManagerList } from "./manager-list";

export default async function CalisanlarPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ sekme?: string }>;
}) {
  const { branch: branchSlug } = await params;
  const { sekme } = await searchParams;
  const session = await requireSessionContext(branchSlug);
  if (!isManager(session.role)) redirect(`/${branchSlug}`);

  // The Yöneticiler tab is admin-only; a patron always gets the employee list.
  const showManagers = session.role === "admin" && sekme === "yoneticiler";
  const supabase = await createClient();

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-pz-text">
          {showManagers ? "Yöneticiler" : "Çalışanlar"}
        </h1>
        <Link
          href={showManagers ? `/${branchSlug}/calisanlar/yonetici/yeni` : `/${branchSlug}/calisanlar/yeni`}
          className="flex h-11 items-center gap-1.5 rounded-xl bg-pz-accent-soft px-3 text-sm font-semibold text-pz-accent"
        >
          <Plus className="size-4" aria-hidden />
          {showManagers ? "Yeni yönetici" : "Yeni çalışan"}
        </Link>
      </div>

      {session.role === "admin" ? (
        <nav aria-label="Hesap türü" className="grid grid-cols-2 gap-1 rounded-xl bg-pz-surface-2 p-1">
          {[
            { href: `/${branchSlug}/calisanlar`, label: "Çalışanlar", active: !showManagers },
            { href: `/${branchSlug}/calisanlar?sekme=yoneticiler`, label: "Yöneticiler", active: showManagers },
          ].map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold",
                tab.active ? "bg-pz-surface text-pz-text shadow-sm" : "text-pz-muted",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {showManagers ? (
        <ManagerSection branchSlug={branchSlug} supabase={supabase} />
      ) : (
        <EmployeeSection branchSlug={branchSlug} branchId={session.branch.id} supabase={supabase} />
      )}
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function EmployeeSection({
  branchSlug,
  branchId,
  supabase,
}: {
  branchSlug: string;
  branchId: string;
  supabase: Supabase;
}) {
  const employees = await getEmployeeList(supabase, branchId, monthStart(todayInAmsterdam()));
  return employees.length === 0 ? (
    <EmptyState icon={Users} title="Henüz çalışan yok" />
  ) : (
    <EmployeeList employees={employees} branchSlug={branchSlug} />
  );
}

async function ManagerSection({ branchSlug, supabase }: { branchSlug: string; supabase: Supabase }) {
  const managers = await getManagerList(supabase);
  return managers.length === 0 ? (
    <EmptyState icon={ShieldCheck} title="Henüz yönetici yok" />
  ) : (
    <ManagerList managers={managers} branchSlug={branchSlug} />
  );
}
