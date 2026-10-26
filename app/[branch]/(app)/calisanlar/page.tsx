import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isManager, requireSessionContext } from "@/lib/session";
import { monthStart, todayInAmsterdam } from "@/lib/time";
import { getEmployeeList } from "@/features/accounts/queries";
import { EmptyState } from "@/components/app/empty-state";
import { EmployeeList } from "./employee-list";

export default async function CalisanlarPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch: branchSlug } = await params;
  const session = await requireSessionContext(branchSlug);
  if (!isManager(session.role)) redirect(`/${branchSlug}`);

  const supabase = await createClient();
  const employees = await getEmployeeList(
    supabase,
    session.branch.id,
    monthStart(todayInAmsterdam()),
  );

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-pz-text">Çalışanlar</h1>
        <Link
          href={`/${branchSlug}/calisanlar/yeni`}
          className="flex items-center gap-1.5 rounded-xl bg-pz-accent-soft px-3 py-2 text-sm font-semibold text-pz-accent"
        >
          <Plus className="size-4" aria-hidden />
          Yeni çalışan
        </Link>
      </div>

      {employees.length === 0 ? (
        <EmptyState icon={Users} title="Henüz çalışan yok" />
      ) : (
        <EmployeeList employees={employees} branchSlug={branchSlug} />
      )}
    </div>
  );
}
