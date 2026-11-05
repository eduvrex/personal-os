/**
 * Configurable daily habits. Client- and server-safe (no secrets, no
 * server-only imports). Edit this list to change which habits are tracked;
 * keep `id` stable since it's what gets persisted in daily_logs.
 */
export interface HabitDef {
  id: string;
  label: string;
}

export const HABITS: HabitDef[] = [
  { id: "study", label: "Study" },
  { id: "sleep", label: "Sleep 7h" },
  { id: "exercise", label: "Exercise" },
  { id: "read", label: "Read" },
  { id: "no-doomscroll", label: "No doomscroll" },
  { id: "water", label: "Water" },
  { id: "meditate", label: "Meditate 10 min" },
  { id: "plan-tomorrow", label: "Plan tomorrow" },
  { id: "gre-prep", label: "GRE prep 45 min" },
];

export const HABIT_IDS = HABITS.map((h) => h.id);
