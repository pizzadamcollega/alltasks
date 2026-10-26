import { requireSessionContext, isManager } from "@/lib/session";
import { EmployeeHome } from "./employee-home";
import { PatronHome } from "./patron-home";

export default async function BranchHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ hafta?: string }>;
}) {
  const [{ branch }, { hafta }] = await Promise.all([params, searchParams]);
  const session = await requireSessionContext(branch);

  return isManager(session.role) ? (
    <PatronHome session={session} hafta={hafta} />
  ) : (
    <EmployeeHome session={session} hafta={hafta} />
  );
}
