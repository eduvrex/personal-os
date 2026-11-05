"use client";

import { useEffect, useState } from "react";

import { PROFILE } from "@/lib/config/profile";
import { AsteriskCluster, RisingWords } from "@/components/ui/PageHeader";
import { useParallax } from "@/lib/reveal";

/**
 * The Home page's editorial cover: a time-of-day greeting set enormous in
 * the display serif (name in italic), under a mono folio line. The greeting
 * rises word by word, the ghost type drifts on scroll, and a "scroll" cue
 * sits in the closing rule until the reader moves. Greeting and date resolve
 * after mount so SSR and client never disagree.
 */
export function HomeHero() {
  const [now, setNow] = useState<Date | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const ghostRef = useParallax<HTMLSpanElement>(0.25);

  useEffect(() => setNow(new Date()), []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const hour = now?.getHours() ?? null;
  const greeting =
    hour == null ? "Hello" : hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const date = now
    ? now
        .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
        .toUpperCase()
    : "";

  return (
    <div className="relative col-span-full mb-2 mt-4 overflow-visible px-1">
      <span
        aria-hidden
        ref={ghostRef}
        className="ghost-title pointer-events-none absolute -top-8 left-0 text-[7rem] will-change-transform sm:text-[10rem]"
      >
        {greeting}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-20 h-64 w-[36rem] bg-[radial-gradient(50%_50%_at_35%_45%,color-mix(in_srgb,var(--color-ember)_18%,transparent),transparent_70%)]"
      />
      <div className="relative">
        <p className="section-label mb-2">
          <span className="text-ember">The daily edition</span>
          {date ? <span className="ml-2 text-faint">— {date}</span> : null}
        </p>
        {/* Keyed by greeting so the words re-rise once the real time resolves. */}
        <h1 key={greeting} className="font-display text-5xl leading-[0.95] text-ink-4 sm:text-7xl">
          <RisingWords text={`${greeting},`} />
          <span className="word-mask">
            <em className="word-rise italic text-ember" style={{ animationDelay: "240ms" }}>
              {PROFILE.name}.
            </em>
          </span>
          <AsteriskCluster spin={false} />
        </h1>
        <div className="mt-5 flex items-center gap-3">
          <span aria-hidden className="rule-block" />
          <span aria-hidden className="rule-draw h-px flex-1 bg-white/[0.1]" />
          <span aria-hidden className="font-mono text-[9px] tracking-[0.3em] text-faint">
            EVERYTHING, ON ONE PAGE
          </span>
          <span aria-hidden className="h-px w-16 bg-white/[0.1]" />
          <span
            aria-hidden
            className={`scroll-cue flex items-center gap-1.5 font-mono text-[9px] tracking-[0.3em] text-ember/80 transition-opacity duration-500 ${
              scrolled ? "opacity-0" : "opacity-100"
            }`}
          >
            SCROLL
            <span className="scroll-cue-arrow">↓</span>
          </span>
        </div>
      </div>
    </div>
  );
}
