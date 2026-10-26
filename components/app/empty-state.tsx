import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-dashed border-pz-border px-4 py-10 text-center",
        className,
      )}
    >
      {Icon ? <Icon className="size-8 text-pz-muted" aria-hidden /> : null}
      <p className="text-sm font-semibold text-pz-text">{title}</p>
      {description ? <p className="text-[13px] text-pz-muted">{description}</p> : null}
    </div>
  );
}
