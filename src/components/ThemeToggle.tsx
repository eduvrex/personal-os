"use client";

import { useEffect, useState } from "react";

type Theme = "day" | "night";

/**
 * Day/night switch. The boot script in layout.tsx has already stamped
 * html[data-theme] before paint; this button just flips the attribute and
 * persists the choice. Reads the current theme after mount so SSR markup
 * never disagrees with the client.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "day" ? "day" : "night");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "day" ? "night" : "day";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pos-theme", next);
    } catch {
      /* private mode — the choice just won't persist */
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "day" ? "Switch to night mode" : "Switch to day mode"}
      title={theme === "day" ? "Night mode" : "Day mode"}
      className={`flex items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-3 transition-colors duration-200 hover:border-ember/40 hover:text-ember ${className}`}
    >
      {/* Icon-only (the rail is tight at 13 tabs); neutral glyph until
          mounted so hydration always matches. */}
      <span aria-hidden>{theme == null ? "◐" : theme === "day" ? "☾" : "☀"}</span>
    </button>
  );
}
