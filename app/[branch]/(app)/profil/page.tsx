import { requireSessionContext } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeForm } from "./theme-form";
import { PasswordForm } from "./password-form";
import { SignOutButton } from "./sign-out-button";

export default async function ProfilPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch } = await params;
  const session = await requireSessionContext(branch);

  return (
    <div className="flex flex-col gap-4 pt-2 pb-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-pz-text">Profil</h1>
        <p className="text-sm text-pz-muted">
          {session.fullName} · {session.username}
        </p>
      </div>

      <Card className="rounded-card">
        <CardHeader>
          <CardTitle className="text-base">Görünüm</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeForm initialTheme={session.theme} />
        </CardContent>
      </Card>

      <Card className="rounded-card">
        <CardHeader>
          <CardTitle className="text-base">Şifre</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <SignOutButton branchSlug={session.branch.slug} />
    </div>
  );
}
