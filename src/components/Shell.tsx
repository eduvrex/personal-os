import type { ReactNode } from "react";

import { TopRail } from "@/components/TopRail";
import { CaptureBar } from "@/components/CaptureBar";
import { CommandPalette } from "@/components/CommandPalette";

/** Page layout: top rail, scrolling content, and the floating capture bar. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Atmosphere: theme glow field, blueprint grid, day chroma edge,
          edge vignette, fixed film grain. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="glow absolute -inset-[10%]" />
        <div className="grid-lines absolute inset-0" />
        <div className="chroma-edge" />
        <div className="vignette absolute inset-0" />
        <div className="grain absolute inset-0" />
      </div>
      <TopRail />
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-4">{children}</main>

      {/* Colophon — hairline rule, mono meta, and the cropped ghost wordmark. */}
      <footer aria-hidden className="pointer-events-none relative mx-auto mt-16 max-w-[1400px] select-none overflow-hidden px-4 pb-24">
        <div className="flex items-center gap-3 border-t border-white/[0.08] pt-3 font-mono text-[9px] uppercase tracking-[0.3em] text-faint">
          <span className="rule-block" style={{ height: 3 }} />
          <span>Personal OS — Daily Edition</span>
          <span className="ml-auto text-ember">✳</span>
          <span>Printed nowhere · Read daily</span>
        </div>
        {/* The wordmark drifts by, enormous and hollow — a slow tide, not a ticker. */}
        <div className="marquee -mb-24 mt-6">
          <div className="marquee-track" style={{ animationDuration: "80s" }}>
            <span className="ghost-title pr-[6vw] text-[16vw] leading-none">
              Personal OS <span className="px-[3vw] text-[9vw] align-middle">✳</span> Personal OS <span className="px-[3vw] text-[9vw] align-middle">✳</span>
            </span>
            <span className="ghost-title pr-[6vw] text-[16vw] leading-none">
              Personal OS <span className="px-[3vw] text-[9vw] align-middle">✳</span> Personal OS <span className="px-[3vw] text-[9vw] align-middle">✳</span>
            </span>
          </div>
        </div>
      </footer>

      <CaptureBar />
      <CommandPalette />
    </div>
  );
}
