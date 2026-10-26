"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 rounded-full"
      aria-label="Temayı değiştir"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* resolvedTheme is undefined on the server; the icon flips to the
          correct one as soon as next-themes resolves it client-side. */}
      <span suppressHydrationWarning>
        {resolvedTheme === "dark" ? (
          <Sun className="size-5" aria-hidden />
        ) : (
          <Moon className="size-5" aria-hidden />
        )}
      </span>
    </Button>
  );
}
