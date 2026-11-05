"use client";

import { useEffect, useState } from "react";

/** Live clock + date. Renders a placeholder until mounted to avoid hydration mismatch. */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString("en-US", { hour12: false })
    : "--:--:--";
  const date = now
    ? now
        .toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
        .toUpperCase()
        .replace(",", " ·")
    : "";

  return (
    <div className="text-right leading-tight">
      <div className="font-mono text-sm text-ink-4 tabular-nums">{time}</div>
      <div className="whitespace-nowrap font-mono text-[10px] tracking-wider text-ink-3">{date}</div>
    </div>
  );
}
