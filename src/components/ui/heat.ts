/**
 * Sequential single-hue ramp for habit heat cells: more habits done → deeper
 * wash. Shared by the Home card strip and the Habits tab grids. Built on the
 * theme tokens so the ramp holds in both day and night modes. The design
 * pass added a second ramp: ember for aggregate grids, sky for the
 * per-habit strips.
 */
export function heatColor(
  done: number,
  total: number,
  hue: "ember" | "sky" = "ember",
): string {
  const c = `var(--color-${hue})`;
  if (done <= 0) return "color-mix(in srgb, var(--color-white) 5%, transparent)";
  const ratio = done / Math.max(1, total);
  if (ratio >= 1) return c;
  if (ratio >= 2 / 3) return `color-mix(in srgb, ${c} 72%, transparent)`;
  if (ratio >= 1 / 3) return `color-mix(in srgb, ${c} 48%, transparent)`;
  return `color-mix(in srgb, ${c} 26%, transparent)`;
}
