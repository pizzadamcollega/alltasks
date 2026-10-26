import { requireSessionContext } from "@/lib/session";
import { AppHeader } from "@/components/app/app-header";
import { BottomNav, SidebarNav } from "@/components/app/app-nav";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branch: string }>;
}) {
  const { branch } = await params;
  const session = await requireSessionContext(branch);

  return (
    <div className="flex min-h-screen bg-pz-bg">
      <SidebarNav role={session.role} branch={session.branch.slug} />
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader branch={session.branch.slug} fullName={session.fullName} role={session.role} />
        <main className="flex-1 px-4 pb-24 lg:px-6 lg:pb-8">
          <div className="mx-auto w-full max-w-[960px]">{children}</div>
        </main>
      </div>
      <BottomNav role={session.role} branch={session.branch.slug} />
    </div>
  );
}
