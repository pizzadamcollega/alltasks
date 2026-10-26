import { requireSessionContext, isManager } from "@/lib/session";
import { EmployeeHome } from "./employee-home";
import { PatronHome } from "./patron-home";

export default async function BranchHomePage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch } = await params;
  const session = await requireSessionContext(branch);

  return isManager(session.role) ? (
    <PatronHome session={session} />
  ) : (
    <EmployeeHome session={session} />
  );
}
