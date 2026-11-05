"use client";

import { useEffect, useState } from "react";

import { TABS } from "@/lib/config/nav";
import { useParallax } from "@/lib/reveal";

/** Triple asterisk cluster — rose, sun, sky in descending sizes (design pass). */
export function AsteriskCluster({ spin = true }: { spin?: boolean }) {
  return (
    <span aria-hidden className="ml-3 inline-block whitespace-nowrap align-super">
      <span className={`inline-block text-2xl text-ember sm:text-3xl ${spin ? "asterisk-spin" : ""}`}>✳</span>
      <span className="-ml-1 inline-block text-[15px] text-sun sm:text-base">✳</span>
      <span className="-ml-0.5 inline-block align-text-top text-[11px] text-sky sm:text-xs">✳</span>
    </span>
  );
}

/** Mono folio coordinates — fiscal year + ISO week ("FY26 · W27"). */
export function folioCoords(now = new Date()): string {
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const week = Math.max(
    1,
    Math.round(((+now - +jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7) + 1,
  );
  return `FY${String(now.getFullYear() % 100).padStart(2, "0")} · W${String(week).padStart(2, "0")}`;
}

/** Wraps each word for the staggered rise-from-baseline headline entrance. */
export function RisingWords({ text, startDelayMs = 0 }: { text: string; startDelayMs?: number }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span key={i}>
          <span className="word-mask">
            <span
              className="word-rise"
              style={{ animationDelay: `${startDelayMs + i * 90}ms` }}
            >
              {word}
            </span>
          </span>{" "}
        </span>
      ))}
    </>
  );
}

/**
 * Editorial page opener — the magazine spread each tab starts on:
 * a mono folio line (section № + group), an oversized high-contrast serif
 * headline over its own ghost-type watermark and a soft ember wash, closed
 * by a hairline rule with an ember asterisk. The headline rises word by
 * word; the watermark drifts on scroll at a slower rate than the page
 * (the parallax depth cue). Purely visual; no behavior.
 */
export function PageHeader({
  kicker,
  title,
  width = "",
}: {
  kicker?: string;
  title: string;
  width?: string;
}) {
  // Folio number = position in the rail (01-indexed, Home excluded).
  const idx = TABS.findIndex((t) => t.label === title);
  const folio = idx > 0 ? String(idx).padStart(2, "0") : null;
  const ghostRef = useParallax<HTMLSpanElement>(0.22);
  // Coordinates resolve after mount so static prerenders never disagree.
  const [coords, setCoords] = useState("");
  useEffect(() => setCoords(folioCoords()), []);

  return (
    <div className={`relative mx-auto mb-4 mt-6 w-full overflow-visible px-1 ${width}`}>
      {/* Ghost watermark — the title again, enormous and hollow. */}
      <span
        aria-hidden
        ref={ghostRef}
        className="ghost-title pointer-events-none absolute -top-10 left-0 text-[7rem] will-change-transform sm:text-[9rem]"
      >
        {title}
      </span>
      {/* A concentrated ember wash behind the headline. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-56 w-[28rem] bg-[radial-gradient(50%_50%_at_35%_45%,color-mix(in_srgb,var(--color-ember)_16%,transparent),transparent_70%)]"
      />

      <div className="relative">
        {/* Registration marks — the print-proof corners. */}
        <span aria-hidden className="reg-mark right-1 top-0">+</span>
        <span aria-hidden className="reg-mark -bottom-1 left-0">+</span>
        <p className="section-label mb-2 flex items-baseline justify-between gap-2 pr-6">
          <span className="flex items-baseline gap-2">
            {folio ? <span className="text-ember">№ {folio}</span> : null}
            {kicker ? <span>— {kicker}</span> : null}
          </span>
          <span className="opacity-70">{coords}</span>
        </p>
        <h1 className="font-display text-5xl leading-[0.95] text-ink-4 sm:text-7xl">
          <RisingWords text={title} />
          <AsteriskCluster />
        </h1>
        <div className="mt-5 flex items-center gap-3">
          <span aria-hidden className="rule-block" />
          <span aria-hidden className="rule-draw h-px flex-1 bg-white/[0.1]" />
          <span aria-hidden className="font-mono text-[9px] tracking-[0.3em] text-faint">
            PERSONAL OS
          </span>
        </div>
      </div>
    </div>
  );
}
