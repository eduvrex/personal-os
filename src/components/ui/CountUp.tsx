"use client";

import { useEffect, useRef, useState } from "react";

import { useInView } from "@/lib/reveal";

interface CountUpProps {
  value: number;
  /** Renders the in-flight number (currency, unit suffix, …). */
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}

/** Ease-out-expo — fast start, long soft landing (the "odometer settling"). */
function ease(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * A number that rolls up from its previous value (0 on first sight) when it
 * scrolls into view — the labeled-data-point moment. Under reduced motion it
 * renders the final value immediately.
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  durationMs = 1000,
  className,
}: CountUpProps) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const from = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    if (reduce || start === value) {
      from.current = value;
      setDisplay(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const n = start + (value - start) * ease(t);
      setDisplay(t >= 1 ? value : n);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {format(inView ? display : 0)}
    </span>
  );
}
