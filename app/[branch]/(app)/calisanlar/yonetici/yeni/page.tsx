import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSessionContext } from "@/lib/session";
import { getBranchOptions } from "@/features/accounts/queries";
import { NewManagerForm } from "./new-manager-form";

export default async function YeniYoneticiPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch: branchSlug } = await params;
  const session = await requireSessionContext(branchSlug);
  if (session.role !== "admin") redirect(`/${branchSlug}`);

  const branches = await getBranchOptions(await createClient());

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <h1 className="text-[22px] font-bold text-pz-text">Yeni yönetici</h1>
      <NewManagerForm branchId={session.branch.id} branchSlug={branchSlug} branches={branches} />
    </div>
  );
}
