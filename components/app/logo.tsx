import Image from "next/image";
import { cn } from "@/lib/utils";

/** The 64px accent tile from the login mockup (docs/mockups/Giris.dc.html). */
export function LogoTile({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl bg-pz-accent",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/pizza.svg"
        alt=""
        width={size * 0.62}
        height={size * 0.62}
        priority
      />
    </div>
  );
}
