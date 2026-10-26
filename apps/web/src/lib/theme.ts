/**
 * Theme preference (spec #280). "auto" follows the OS (the CSS media query),
 * light/dark pin an explicit data-theme. Pure resolution is tested; the
 * storage write is guarded because private windows can throw.
 */
export type ThemePref = "auto" | "light" | "dark";
export const THEME_KEY = "agentos.web.theme";

export function resolveTheme(pref: ThemePref): "light" | "dark" | null {
  return pref === "auto" ? null : pref;
}

export function applyTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage blocked: the attribute still applies for this page */
  }
  const resolved = resolveTheme(pref);
  if (resolved === null) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = resolved;
}

export function storedTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}
