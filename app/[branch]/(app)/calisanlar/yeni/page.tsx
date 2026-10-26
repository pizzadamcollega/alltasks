import { redirect } from "next/navigation";
import { isManager, requireSessionContext } from "@/lib/session";
import { NewEmployeeForm } from "./new-employee-form";

export default async function YeniCalisanPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch: branchSlug } = await params;
  const session = await requireSessionContext(branchSlug);
  if (!isManager(session.role)) redirect(`/${branchSlug}`);

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <h1 className="text-[22px] font-bold text-pz-text">Yeni çalışan</h1>
      <NewEmployeeForm branchId={session.branch.id} branchSlug={branchSlug} />
    </div>
  );
}
