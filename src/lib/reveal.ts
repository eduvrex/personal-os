"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-reveal machinery for the editorial motion pass.
 *
 * One IntersectionObserver is shared by every revealed element; entries that
 * enter the viewport in the same frame get an incremental transition delay so
 * sibling cards cascade instead of popping in at once. Elements are observed
 * once — after revealing they are unobserved and stay put.
 */

const STAGGER_MS = 70;
const STAGGER_CAP_MS = 420;

let sharedObserver: IntersectionObserver | null = null;

function reduceMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        let batchIndex = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          // Delay only the entrance channels (see .reveal) — hover feedback
          // on the same element must stay immediate.
          el.style.setProperty(
            "--reveal-delay",
            `${Math.min(batchIndex * STAGGER_MS, STAGGER_CAP_MS)}ms`,
          );
          el.classList.add("is-inview");
          sharedObserver?.unobserve(el);
          batchIndex++;
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );
  }
  return sharedObserver;
}

/**
 * Attach to an element carrying the `.reveal` class: it fades/rises into
 * place the first time it scrolls into view. Falls back to instantly visible
 * when IntersectionObserver is unavailable or the user prefers reduced motion.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = getSharedObserver();
    if (!observer || reduceMotion()) {
      el.classList.add("is-inview");
      return;
    }
    observer.observe(el);
    return () => observer.unobserve(el);
  }, []);

  return ref;
}

/**
 * Boolean flavour for components that animate their own paint (count-ups,
 * progress fills, ring arcs). Flips to true once and stays true.
 */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined" || reduceMotion()) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -4% 0px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  return { ref, inView } as const;
}

/**
 * rAF-throttled vertical parallax: translates the element at `factor` × the
 * page scroll (ghost watermarks drift slower than the content in front).
 * No-ops under reduced motion.
 */
export function useParallax<T extends HTMLElement>(factor = 0.3) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion()) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.transform = `translate3d(0, ${window.scrollY * factor}px, 0)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [factor]);

  return ref;
}
