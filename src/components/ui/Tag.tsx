const TONES = {
  neutral: "border-white/10 bg-white/5 text-ink-3",
  rose: "border-ember/30 bg-ember/10 text-ember",
  iris: "border-iris/35 bg-iris/[0.12] text-iris-soft",
  sun: "border-sun/30 bg-sun/10 text-sun",
  sky: "border-sky/30 bg-sky/10 text-sky",
} as const;

export type TagTone = keyof typeof TONES;

/**
 * Guess a domain tone from a label (design pass: "each domain keeps its own
 * hue" — money sun, academic iris, health sky, urgent rose).
 */
export function toneFor(label: string): TagTone {
  const l = label.toLowerCase();
  if (/urgent|overdue|due/.test(l)) return "rose";
  if (/finance|money|spend|saving|debt|budget/.test(l)) return "sun";
  if (/school|academic|course|study|apply|master/.test(l)) return "iris";
  if (/health|fitness|body|habit/.test(l)) return "sky";
  return "neutral";
}

interface TagProps {
  label: string;
  /** Legacy variants: course → iris (academic), personal → neutral. */
  kind?: "course" | "personal";
  /** Explicit domain tone; overrides kind. */
  tone?: TagTone;
}

/** Small monospace pill used for course codes and category labels. */
export function Tag({ label, kind = "course", tone }: TagProps) {
  const resolved = tone ?? (kind === "course" ? "iris" : "neutral");
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${TONES[resolved]}`}
    >
      {label}
    </span>
  );
}
