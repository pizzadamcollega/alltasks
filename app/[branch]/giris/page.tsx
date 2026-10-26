import { notFound } from "next/navigation";
import { BRANCHES, isKnownBranchSlug } from "@/lib/branches";
import { LogoTile } from "@/components/app/logo";
import { LoginForm } from "./login-form";

const ERROR_MESSAGES: Record<string, string> = {
  pasif: "Hesabın pasif durumda. Patronundan aktif etmesini iste.",
  yetkisiz: "Bu şubeye kayıtlı değilsin.",
};

export default async function GirisPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch: string }>;
  searchParams: Promise<{ hata?: string }>;
}) {
  const { branch } = await params;
  const { hata } = await searchParams;

  if (!isKnownBranchSlug(branch)) notFound();
  const branchName = BRANCHES[branch].name;
  const errorMessage = hata ? ERROR_MESSAGES[hata] : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <LogoTile />
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-bold text-pz-text">Pizzadam</h1>
          <p className="text-sm text-pz-muted">Personel girişi</p>
        </div>
        <span className="rounded-chip bg-pz-accent-soft px-3 py-1 text-sm font-semibold text-pz-accent">
          {branchName}
        </span>
      </div>

      <div className="w-full max-w-sm">
        {errorMessage ? (
          <p role="alert" className="mb-4 text-center text-sm font-medium text-pz-bad">
            {errorMessage}
          </p>
        ) : null}
        <LoginForm branchSlug={branch} />
      </div>

      <p className="text-center text-xs text-pz-muted">
        Şifreni unuttuysan patronundan sıfırlamasını iste.
      </p>
    </main>
  );
}
