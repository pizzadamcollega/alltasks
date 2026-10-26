import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared error state (SCREENS.md "common states"): every screen shows this on a fetch failure. */
export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-pz-bad bg-pz-bad-soft px-4 py-8 text-center"
    >
      <AlertTriangle className="size-6 text-pz-bad" aria-hidden />
      <p className="text-sm font-semibold text-pz-bad">Bir hata oluştu, tekrar dene.</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Yenile
      </Button>
    </div>
  );
}
