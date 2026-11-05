import { localDateKey } from "@/lib/localDate";

/** Render a YYYY-MM-DD key as "Today" / "Yesterday" / "Mon, Jun 25". */
export function formatEntryDate(key: string): string {
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Format a minute count as a compact duration: 45 → "45m", 90 → "1h 30m". */
export function formatMinutes(min: number | null | undefined): string {
  if (!min || min <= 0) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Reduce a course entity name to its bare code for tag display:
 * "ECON 3070 — Intermediate Microeconomic Theory" → "ECON 3070".
 * Falls back to the text before an em dash, then to the name itself.
 */
export function courseCode(name: string | null | undefined): string {
  if (!name) return "";
  const m = name.match(/^\s*([A-Z]{2,4})\s*(\d{3,4}[A-Z]?)/);
  if (m) return `${m[1]} ${m[2]}`;
  const dash = name.split(/\s+[—–-]\s+/)[0].trim();
  return dash || name.trim();
}
