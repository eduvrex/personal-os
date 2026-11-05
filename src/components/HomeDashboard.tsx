import { HomeHero } from "@/components/HomeHero";
import { Marquee } from "@/components/ui/Marquee";
import { TABS, isPrivateTab } from "@/lib/config/nav";
import { Operator } from "@/components/dashboard/Operator";
import { TodayRhythm } from "@/components/dashboard/TodayRhythm";
import { WorkToday } from "@/components/dashboard/WorkToday";
import { FinancePulse } from "@/components/dashboard/FinancePulse";
import { HabitTracker } from "@/components/dashboard/HabitTracker";
import { NextSteps } from "@/components/dashboard/NextSteps";
import { TodayTop3 } from "@/components/dashboard/TodayTop3";
import { SchoolAssignments } from "@/components/dashboard/SchoolAssignments";
import { GoalsSnapshot } from "@/components/dashboard/GoalsSnapshot";
import { Brain } from "@/components/dashboard/Brain";
import { Reflect } from "@/components/dashboard/Reflect";

/**
 * The full Home dashboard. Rendered at `/` normally, and at `/home` always —
 * so it stays one click away while lock-in mode owns the front page.
 */
export function HomeDashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <HomeHero />

      {/* The table of contents as a slow ticker — every section, numbered. */}
      <div className="col-span-full -mt-1 mb-1 border-y border-white/[0.05] py-2">
        <Marquee
          items={TABS.filter((t) => t.href !== "/" && t.href !== "/home" && !isPrivateTab(t)).map(
            (t, i) => `№ ${String(i + 1).padStart(2, "0")} ${t.label}`,
          )}
        />
      </div>

      {/* Left */}
      <div className="flex flex-col gap-4 lg:col-span-3">
        <Operator />
        <TodayRhythm />
        <WorkToday />
        <FinancePulse />
        <HabitTracker />
      </div>

      {/* Centre */}
      <div className="flex flex-col gap-4 lg:col-span-6">
        <NextSteps />
        <TodayTop3 />
        <SchoolAssignments />
        <GoalsSnapshot />
      </div>

      {/* Right */}
      <div className="flex flex-col gap-4 lg:col-span-3">
        <Brain />
        <Reflect />
      </div>
    </div>
  );
}
