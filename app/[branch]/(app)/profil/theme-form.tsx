"use client";

import { useTheme } from "next-themes";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { updateThemeAction } from "./actions";

const OPTIONS = [
  { value: "light", label: "Aydınlık" },
  { value: "dark", label: "Karanlık" },
  { value: "system", label: "Cihaz" },
] as const;

export function ThemeForm({ initialTheme }: { initialTheme: "system" | "light" | "dark" }) {
  const { setTheme } = useTheme();
  const [value, setValue] = useState(initialTheme);
  const [, startTransition] = useTransition();

  function handleChange(next: string) {
    setValue(next as typeof value);
    setTheme(next);
    startTransition(async () => {
      const result = await updateThemeAction(next);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <RadioGroup
      value={value}
      onValueChange={handleChange}
      aria-label="Görünüm"
      className="grid grid-cols-3 gap-2"
    >
      {OPTIONS.map((option) => (
        <Label
          key={option.value}
          htmlFor={`theme-${option.value}`}
          className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-pz-border text-sm font-semibold text-pz-text has-[[data-state=checked]]:border-pz-accent has-[[data-state=checked]]:bg-pz-accent-soft has-[[data-state=checked]]:text-pz-accent"
        >
          <RadioGroupItem value={option.value} id={`theme-${option.value}`} className="sr-only" />
          {option.label}
        </Label>
      ))}
    </RadioGroup>
  );
}
