import "server-only";

import { listNudges } from "@/lib/nudges";
import { queryTasks } from "@/lib/tasks";
import { listApplications } from "@/lib/applications";
import { buildFinanceOverview } from "@/lib/financeOverview";
import { getDayNotes, mergeDayNotes } from "@/lib/dayLog";
import { todayCalendarEvents } from "@/lib/calendar";
import { rhythmBriefingLines } from "@/lib/rhythm";
import { localDateKey, USER_TIMEZONE } from "@/lib/localDate";
import { HABITS } from "@/lib/config/habits";
import { tgSendMessage } from "@/lib/telegram";

/**
 * Compose the morning briefing text. Reads only public data — NEVER the private
 * Personal space. Stores today's net worth so tomorrow can compute the delta.
 */
export async function composeBriefing(): Promise<string> {
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const friendly = new Date(`${today}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [nudges, todayTasks, apps, finance, todNotes, yNotes, calEvents, rhythmLines] =
    await Promise.all([
      listNudges(),
      queryTasks({ urgency: "today", status: "open" }),
      listApplications(),
      buildFinanceOverview(),
      getDayNotes(today),
      getDayNotes(yesterday),
      todayCalendarEvents(),
      // Today's routine — plain labels the user set.
      rhythmBriefingLines(),
    ]);

  // Net worth + delta since yesterday, and snapshot today's for tomorrow.
  const nw = Math.round(finance.netWorth);
  const yNw = typeof yNotes.net_worth === "number" ? (yNotes.net_worth as number) : null;
  await mergeDayNotes(today, { net_worth: nw });
  const nwLine =
    yNw == null
      ? `Net worth: $${nw.toLocaleString()} (first snapshot)`
      : `Net worth: $${nw.toLocaleString()} (${nw - yNw >= 0 ? "+" : "−"}$${Math.abs(nw - yNw).toLocaleString()} since yesterday)`;

  // Application deadlines within 30 days.
  const soon = apps
    .filter((a) => a.deadline)
    .map((a) => ({
      a,
      d: Math.round((Date.parse(`${a.deadline}T00:00:00`) - Date.now()) / 86_400_000),
    }))
    .filter((x) => x.d >= 0 && x.d <= 30)
    .sort((x, y) => x.d - y.d);

  // Habit checklist for today.
  const habits = (todNotes.habits ?? {}) as { done?: unknown };
  const done = new Set(Array.isArray(habits.done) ? (habits.done as string[]) : []);
  const habitLine = HABITS.map((h) => `${done.has(h.id) ? "✅" : "⬜"} ${h.label}`).join("  ");

  const lines: string[] = [`☀️ Good morning — ${friendly}`, ""];

  if (rhythmLines.length) {
    lines.push("Today's rhythm:");
    rhythmLines.forEach((l) => lines.push(`• ${l}`));
    lines.push("");
  }

  if (nudges.length) {
    lines.push("Top next steps:");
    nudges.slice(0, 3).forEach((n, i) =>
      lines.push(`${i + 1}. ${n.text}${n.plan ? ` (${n.plan})` : ""}`),
    );
    lines.push("");
  }

  lines.push("Today's tasks:");
  lines.push(todayTasks.length ? todayTasks.map((t) => `• ${t.title}`).join("\n") : "• (none)");
  lines.push("");

  if (calEvents.length) {
    lines.push("Today's calendar:");
    calEvents.forEach((e) => {
      const t = e.allDay
        ? "all day"
        : new Date(e.start).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: USER_TIMEZONE,
          });
      lines.push(`• ${t} — ${e.title}`);
    });
    lines.push("");
  }

  if (soon.length) {
    lines.push("Deadlines within 30 days:");
    soon.forEach(({ a, d }) => lines.push(`• ${a.org} — ${a.title} (${d}d)`));
    lines.push("");
  }

  lines.push(nwLine, "", `Habits: ${habitLine}`);
  return lines.join("\n");
}

/** Compose and send the briefing to Telegram. Returns the text. */
export async function sendBriefing(): Promise<string> {
  const text = await composeBriefing();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_USER_ID;
  if (token && chatId) await tgSendMessage(token, chatId, text);
  return text;
}
