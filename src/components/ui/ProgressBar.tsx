"use client";

import { useInView } from "@/lib/reveal";

const HUES = {
  ember: ["var(--color-ember-deep)", "var(--color-ember)"],
  iris: ["var(--color-iris)", "color-mix(in srgb, var(--color-iris) 45%, #ffffff)"],
  sun: ["var(--color-warn)", "var(--color-sun)"],
  sky: ["var(--color-sky)", "var(--color-sky)"],
} as const;

export type ProgressHue = keyof typeof HUES;

interface ProgressBarProps {
  /** 0–1 */
  value: number;
  /** Domain hue (design pass: "one hue per domain"). Defaults to ember. */
  hue?: ProgressHue;
  className?: string;
}

/**
 * Thin rounded track with an ember gradient fill. The fill draws from zero
 * the first time the bar scrolls into view, later width changes animate, and
 * a slow sheen drifts across the filled portion (disabled with reduced
 * motion via the global override).
 */
export function ProgressBar({ value, hue = "ember", className = "" }: ProgressBarProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const [from, to] = HUES[hue];
  return (
    <div
      ref={ref}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${inView ? pct : 0}%`,
          backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${from} 85%, transparent), ${to}), linear-gradient(105deg, transparent 40%, color-mix(in srgb, var(--color-white) 25%, transparent) 50%, transparent 60%)`,
          backgroundBlendMode: "normal, overlay",
          backgroundSize: "100% 100%, 200% 100%",
          animation: pct > 0 ? "shimmer 3.5s linear infinite" : undefined,
        }}
      />
    </div>
  );
}
