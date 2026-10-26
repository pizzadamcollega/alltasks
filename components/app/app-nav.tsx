"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, CheckSquare, Users, History } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";

interface NavItem {
  href: string;
  label: string;
  /** Bottom-bar label when `label` is too long for a tab. */
  shortLabel?: string;
  icon: LucideIcon;
}

/**
 * Only routes this phase actually ships. Takvim/Talepler/Program/Raporlar/
 * Ayarlar/Bildirimler are docs/ROADMAP.md Phase 6-11 — adding nav links to
 * them now would be dead ends. Expand this list as those phases land.
 */
function navItemsFor(role: AppRole, branch: string): NavItem[] {
  if (role === "employee") {
    return [
      { href: `/${branch}`, label: "Ana sayfa", icon: Home },
      { href: `/${branch}/program`, label: "Haftalık program", shortLabel: "Program", icon: CalendarDays },
      { href: `/${branch}/gecmis`, label: "Geçmiş", icon: History },
    ];
  }
  return [
    { href: `/${branch}`, label: "Ana sayfa", icon: Home },
    { href: `/${branch}/program`, label: "Haftalık program", shortLabel: "Program", icon: CalendarDays },
    { href: `/${branch}/onay`, label: "Onay", icon: CheckSquare },
    { href: `/${branch}/calisanlar`, label: "Çalışanlar", icon: Users },
  ];
}

function useActiveItems(role: AppRole, branch: string) {
  const pathname = usePathname();
  const items = navItemsFor(role, branch);
  return items.map((item) => ({
    ...item,
    active: item.href === `/${branch}` ? pathname === item.href : pathname.startsWith(item.href),
  }));
}

/** Bottom tab bar on mobile — hidden at the desktop breakpoint (DESIGN.md §3). */
export function BottomNav({ role, branch }: { role: AppRole; branch: string }) {
  const items = useActiveItems(role, branch);

  return (
    <nav
      aria-label="Ana gezinme"
      className="fixed inset-x-0 bottom-0 z-20 grid border-t border-pz-border bg-pz-surface px-2 pb-[max(14px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ href, label, shortLabel, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
            active ? "text-pz-accent" : "text-pz-muted",
          )}
        >
          <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
          {shortLabel ?? label}
        </Link>
      ))}
    </nav>
  );
}

/** Left sidebar at ≥1024px — replaces the bottom nav (DESIGN.md §3). */
export function SidebarNav({ role, branch }: { role: AppRole; branch: string }) {
  const items = useActiveItems(role, branch);

  return (
    <nav
      aria-label="Ana gezinme"
      className="hidden w-56 shrink-0 flex-col gap-1 border-r border-pz-border bg-pz-surface p-4 lg:flex"
    >
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
            active ? "bg-pz-accent-soft text-pz-accent" : "text-pz-muted hover:bg-pz-surface-2",
          )}
        >
          <Icon className="size-5" strokeWidth={1.8} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
