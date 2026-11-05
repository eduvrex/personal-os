"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { sendJSON } from "@/lib/api";
import { TABS, isPrivateTab } from "@/lib/config/nav";
import type { CaptureResultDTO } from "@/lib/types";

/**
 * ⌘K / Ctrl+K command palette: jump to any tab or capture a thought without
 * leaving the keyboard. Free text that matches nothing becomes a capture.
 * TopRail's ⌘K button opens it via the "pos:palette" window event.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pos:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pos:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setFlash(null);
      // Focus after the portal paints.
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const navItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Tabs flagged `private` in nav.ts never appear in search.
    return TABS.filter(
      (t) =>
        !isPrivateTab(t) &&
        (!q ||
          t.label.toLowerCase().includes(q) ||
          (t.group ?? "").toLowerCase().includes(q)),
    );
  }, [query]);

  const showCapture = query.trim().length > 2;
  const total = navItems.length + (showCapture ? 1 : 0);

  const run = useCallback(
    async (index: number) => {
      if (index < navItems.length) {
        router.push(navItems[index].href);
        setOpen(false);
        return;
      }
      // Capture action.
      const text = query.trim();
      if (!text || busy) return;
      setBusy(true);
      try {
        const res = await sendJSON<CaptureResultDTO>("/api/capture", "POST", {
          text,
        });
        setFlash(`Captured → ${res.label}`);
        setQuery("");
        setTimeout(() => setOpen(false), 900);
      } catch {
        setFlash("Couldn't capture — try the bar below.");
      } finally {
        setBusy(false);
      }
    },
    [navItems, query, busy, router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[15vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-none border border-white/[0.1] bg-ink-1/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, total - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(selected);
            }
          }}
          placeholder="Go somewhere, or just type a thought…"
          className="w-full border-b border-white/[0.06] bg-transparent px-4 py-3.5 text-sm text-ink-4 placeholder:text-ink-3 focus:outline-none"
        />

        <div className="max-h-72 overflow-y-auto p-1.5">
          {navItems.map((t, i) => (
            <button
              key={t.href}
              type="button"
              onClick={() => run(i)}
              onMouseEnter={() => setSelected(i)}
              className={`flex w-full items-center justify-between rounded-[3px] px-3 py-2 text-left text-sm ${
                selected === i ? "bg-white/[0.07] text-ink-4" : "text-ink-3"
              }`}
            >
              <span>{t.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-ink-3/70">
                {t.group ?? ""}
              </span>
            </button>
          ))}

          {showCapture ? (
            <button
              type="button"
              onClick={() => run(navItems.length)}
              onMouseEnter={() => setSelected(navItems.length)}
              disabled={busy}
              className={`flex w-full items-center gap-2 rounded-[3px] px-3 py-2 text-left text-sm ${
                selected === navItems.length
                  ? "bg-ember/10 text-ember"
                  : "text-ink-3"
              }`}
            >
              <span aria-hidden>＋</span>
              <span className="min-w-0 flex-1 truncate">
                {busy ? "Capturing…" : `Capture “${query.trim()}”`}
              </span>
            </button>
          ) : null}

          {total === 0 && !flash ? (
            <div className="px-3 py-2 text-xs italic text-ink-3">
              Keep typing to capture it as a thought…
            </div>
          ) : null}

          {flash ? (
            <div className="px-3 py-2 text-xs text-ember">{flash}</div>
          ) : null}
        </div>

        <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] uppercase tracking-wider text-ink-3/70">
          ↑↓ choose · Enter go · Esc close
        </div>
      </div>
    </div>
  );
}
