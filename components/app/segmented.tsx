"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface SegmentedOption {
  value: string;
  label: string;
}

/** DESIGN.md §4 Segmented control: surface-2 track, 44px tall, active = white + shadow. */
export function Segmented({
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  className,
}: {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  className?: string;
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList
        aria-label={ariaLabel}
        className="h-11 w-full gap-0 rounded-2xl bg-pz-surface-2 p-1"
      >
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className={cn(
              "h-full flex-1 rounded-xl text-sm font-semibold text-pz-muted",
              "data-active:bg-pz-surface data-active:text-pz-text data-active:shadow-sm",
            )}
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
