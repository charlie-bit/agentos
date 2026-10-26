import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, storedTheme, type ThemePref } from "../lib/theme";

/** light → dark → auto cycle, persisted per browser (spec #280). */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("auto");
  useEffect(() => {
    const initial = storedTheme();
    setPref(initial);
    applyTheme(initial);
  }, []);
  const next: ThemePref = pref === "auto" ? "light" : pref === "light" ? "dark" : "auto";
  return (
    <button
      onClick={() => {
        setPref(next);
        applyTheme(next);
      }}
      title={`theme: ${pref} (click for ${next})`}
      className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
    >
      {pref === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      <span className="ml-1 text-[10px]">{pref}</span>
    </button>
  );
}
