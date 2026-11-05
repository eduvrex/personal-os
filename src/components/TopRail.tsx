"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { Clock } from "@/components/Clock";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PROFILE } from "@/lib/config/profile";
import { TABS } from "@/lib/config/nav";

export function TopRail() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const openPalette = () => window.dispatchEvent(new CustomEvent("pos:palette"));

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-0/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-4">
        {/* Brand — serif wordmark, editorial. */}
        <div className="flex items-baseline gap-2.5">
          <Link href="/" className="whitespace-nowrap font-display text-lg leading-none text-ink-4">
            Personal <em className="italic text-ember">OS</em>
          </Link>
          <span className="hidden h-3.5 w-px self-center bg-white/10 sm:block" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.15em] text-ink-3 sm:block">
            {PROFILE.name}
          </span>
        </div>

        {/* Tabs — tracked uppercase labels, ember underline on the active one. */}
        <nav className="hidden items-center gap-1 md:flex">
          {TABS.map((tab, i) => {
            const prev = TABS[i - 1];
            const newGroup = i > 0 && tab.group !== prev.group;
            return (
              <Fragment key={tab.href}>
                {newGroup ? (
                  <span aria-hidden className="mx-1 h-3.5 w-px bg-white/[0.08]" />
                ) : null}
                <Link
                  href={tab.href}
                  className={`relative border-b px-1.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors duration-200 ${
                    isActive(tab.href)
                      ? "border-ember text-ember"
                      : "border-transparent text-ink-3 hover:text-ink-4 after:absolute after:inset-x-1.5 after:-bottom-px after:h-px after:origin-left after:scale-x-0 after:bg-ember/50 after:transition-transform after:duration-300 hover:after:scale-x-100"
                  }`}
                >
                  {tab.label}
                </Link>
              </Fragment>
            );
          })}
        </nav>

        {/* Theme + palette + clock + avatar */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={openPalette}
            aria-label="Open command palette"
            title="Jump anywhere or capture a thought"
            className="hidden items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-ink-3 transition-colors duration-200 hover:border-ember/40 hover:text-ember sm:flex"
          >
            <span aria-hidden>⌘K</span>
          </button>
          <Clock />
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-ember/30 bg-ember/10 font-display text-sm italic text-ember">
            {PROFILE.initial}
          </div>
        </div>
      </div>

      {/* Mobile tabs */}
      <nav className="flex items-center gap-2 overflow-x-auto px-4 pb-2 [mask-image:linear-gradient(to_right,black_92%,transparent)] md:hidden">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 border-b px-1.5 pb-1.5 pt-1 font-mono text-[11px] uppercase tracking-[0.13em] transition-colors duration-200 ${
              isActive(tab.href)
                ? "border-ember text-ember"
                : "border-transparent text-ink-3 hover:text-ink-4"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
