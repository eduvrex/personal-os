/**
 * Editorial ticker — a slow, seamless horizontal loop of tracked mono labels
 * separated by ember asterisks. Decorative only (aria-hidden); pauses on
 * hover; frozen entirely under reduced motion via the global override.
 *
 * The track renders the item list twice and slides -50%, so each half must be
 * identical — spacing lives on the items (padding), not flex gap.
 */
export function Marquee({
  items,
  className = "",
  durationS = 46,
}: {
  items: string[];
  className?: string;
  durationS?: number;
}) {
  const half = items.map((label, i) => (
    <span key={i} className="flex items-center pr-10">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-3">
        {label}
      </span>
      <span className="pl-10 text-[11px] text-ember/80">✳</span>
    </span>
  ));

  return (
    <div aria-hidden className={`marquee select-none ${className}`}>
      <div className="marquee-track" style={{ animationDuration: `${durationS}s` }}>
        <div className="flex shrink-0 items-center">{half}</div>
        <div className="flex shrink-0 items-center">{half}</div>
      </div>
    </div>
  );
}
