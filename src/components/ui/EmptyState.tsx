import type { ReactNode } from "react";

/** Quiet placeholder shown when a card has no data yet — an editorial blank. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-[3px] border border-dashed border-white/[0.08] bg-white/[0.01] px-3 py-5 text-center text-xs text-ink-3">
      <span aria-hidden className="font-display text-base italic text-ember/60">
        ✳
      </span>
      {children}
    </div>
  );
}
