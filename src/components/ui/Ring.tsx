"use client";

import { useId } from "react";

import { CheckIcon } from "@/components/icons";
import { useInView } from "@/lib/reveal";

interface RingProps {
  /** 0–1 */
  value: number;
  label: string;
  sublabel: string;
}

const SIZE = 48;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Circular habit progress ring with a ember gradient stroke; the arc
 * animates between values and glows softly when complete.
 */
export function Ring({ value, label, sublabel }: RingProps) {
  const gradientId = useId();
  const { ref, inView } = useInView<HTMLDivElement>();
  const clamped = Math.max(0, Math.min(1, value));
  const complete = clamped >= 1;
  // The arc stays empty until first seen, then sweeps to its value.
  const offset = CIRCUMFERENCE * (1 - (inView ? clamped : 0));

  return (
    <div ref={ref} className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-ember)" />
              <stop offset="100%" stopColor="var(--color-ember-deep)" />
            </linearGradient>
          </defs>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-white/[0.07]"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
              filter: complete
                ? "drop-shadow(0 0 5px color-mix(in srgb, var(--color-ember) 60%, transparent))"
                : undefined,
            }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-ink-4">
          {complete ? (
            <CheckIcon className="text-[14px] text-ember" />
          ) : (
            Math.round(clamped * 100)
          )}
        </span>
      </div>
      <div className="text-center">
        <div className="text-[10px] font-medium uppercase tracking-wide text-ink-3">
          {label}
        </div>
        <div className="font-mono text-[10px] text-ink-3/70">{sublabel}</div>
      </div>
    </div>
  );
}
