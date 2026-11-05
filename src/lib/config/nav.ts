/**
 * Top-rail navigation. Tabs are grouped so thirteen destinations read as five
 * areas; the groups render as subtle separators on desktop and feed the
 * command palette's section labels.
 */
export const TABS = [
  { label: "Home", href: "/", group: null },
  { label: "Tasks", href: "/tasks", group: "Plan" },
  { label: "Rhythm", href: "/rhythm", group: "Plan" },
  { label: "Calendar", href: "/calendar", group: "Plan" },
  { label: "Goals", href: "/goals", group: "Plan" },
  { label: "Habits", href: "/habits", group: "Plan" },
  { label: "School", href: "/school", group: "School" },
  { label: "Apply", href: "/apply", group: "School" },
  { label: "Akrov", href: "/akrov", group: "Work" },
  { label: "Finance", href: "/finance", group: "Money" },
  { label: "Spending", href: "/spending", group: "Money" },
  { label: "Wishlist", href: "/wishlist", group: "Money" },
  { label: "Brain", href: "/brain", group: "Mind" },
  { label: "Reflect", href: "/reflect", group: "Mind" },
  { label: "Fitness", href: "/fitness", group: "Body" },
  // The full Home dashboard; `/` shows the Lock-in board while it is active.
  { label: "Dashboard", href: "/home", group: null },
  { label: "Me", href: "/me", group: null },
] as const;

export type Tab = (typeof TABS)[number];

/** True for tabs that must stay out of Home's TOC, the palette, and search. */
export function isPrivateTab(tab: Tab): boolean {
  return "private" in tab && tab.private === true;
}
