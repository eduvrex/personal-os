"use client";

import type { ReactNode } from "react";

import { useReveal } from "@/lib/reveal";

interface PanelProps {
  /** Small uppercase label shown in the card header. */
  title?: string;
  /** Optional right-aligned header meta (count, date, badge, …). */
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Shared editorial card wrapper: flat warm surface, ivory hairline border,
 * a faint top highlight, and a tracked mono section label instead of a heavy
 * header. Cards rise into view as they enter the viewport (staggered with
 * their siblings) and lift a breath on hover.
 */
export function Panel({ title, meta, className = "", children }: PanelProps) {
  const ref = useReveal<HTMLElement>();
  return (
    <section
      ref={ref}
      className={`group/panel reveal card-lift relative rounded-none border border-white/[0.08] bg-ink-1/85 p-4 hover:border-white/[0.13] ${className}`}
    >
      {/* Faint highlight along the top edge, brightening toward the centre. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent opacity-70 transition-opacity duration-300 group-hover/panel:opacity-100"
      />
      {/* Drafting-table corner ticks (design pass). */}
      <span aria-hidden className="corner-tick tl" />
      <span aria-hidden className="corner-tick br" />
      {(title || meta) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2 className="section-label panel-no">{title}</h2> : <span />}
          {meta ? (
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              {meta}
            </div>
          ) : null}
        </header>
      )}
      {children}
    </section>
  );
}
