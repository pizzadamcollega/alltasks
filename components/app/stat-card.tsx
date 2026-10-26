import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  /** Hero figures (e.g. monthly totals) use the larger 32px display size. */
  size?: "default" | "hero";
  /** Span both grid columns — for a hero stat above two smaller ones. */
  span2?: boolean;
  valueClassName?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  sub,
  size = "default",
  span2 = false,
  valueClassName,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-card border border-pz-border bg-pz-surface p-3",
        span2 && "col-span-2",
        className,
      )}
    >
      <span className="text-[13px] font-semibold text-pz-muted">{label}</span>
      <span
        className={cn(
          "font-bold tabular-nums tracking-tight text-pz-text",
          size === "hero" ? "text-[32px] leading-tight" : "text-xl",
          valueClassName,
        )}
      >
        {value}
      </span>
      {sub ? <span className="text-xs text-pz-muted">{sub}</span> : null}
    </div>
  );
}

/** 2-column grid wrapper for StatCard groups (DESIGN.md §4). */
export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3", className)}>{children}</div>;
}
