import { courseCode } from "@/lib/format";
import "server-only";

import { buildCalendar } from "@/lib/calendar";
import { buildFinanceOverview } from "@/lib/financeOverview";
import { buildSharingSnapshot } from "@/lib/backup";
import { composeBriefing } from "@/lib/briefing";
import { getResume } from "@/lib/resume";
import { queryTasks } from "@/lib/tasks";
import { composeNow } from "@/lib/rhythmPings";
import { textToDocx } from "@/lib/docx";
import { textToPdf } from "@/lib/pdf";
import { localDateKey, USER_TIMEZONE } from "@/lib/localDate";
import {
  tgSendDocument,
  tgSendLongMessage,
  tgSendMessage,
} from "@/lib/telegram";

type Command =
  | "help"
  | "cv"
  | "briefing"
  | "backup"
  | "spending"
  | "tasks"
  | "events"
  | "now";

export type CommandFormat = "text" | "pdf" | "docx";

export interface MatchedCommand {
  command: Command;
  /** "text" means the command's default rendering (docx for cv, chat text otherwise). */
  format: CommandFormat;
}

const KEYWORDS: Record<string, Command> = {
  help: "help",
  commands: "help",
  start: "help",
  cv: "cv",
  resume: "cv",
  briefing: "briefing",
  brief: "briefing",
  backup: "backup",
  export: "backup",
  spending: "spending",
  finance: "spending",
  tasks: "tasks",
  today: "tasks",
  todo: "tasks",
  events: "events",
  calendar: "events",
  agenda: "events",
  schedule: "events",
  week: "events",
  now: "now",
  next: "now",
  rhythm: "now",
};

/**
 * Conservative intent matcher so genuine captures never get eaten: a message
 * is a command only when it is (optionally slash-prefixed) a bare keyword, or
 * a short "send/give/get (me) (my/the) <keyword>" request — optionally with a
 * format suffix ("cv pdf", "briefing as pdf", "cv as docx"). Anything longer
 * falls through to capture.
 */
export function matchCommand(text: string): MatchedCommand | null {
  let t = text.trim().toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ");

  let format: CommandFormat = "text";
  const fmt = t.match(/\s+(?:as\s+|in\s+)?(pdf|docx|word)$/);
  if (fmt) {
    format = fmt[1] === "pdf" ? "pdf" : "docx";
    t = t.slice(0, fmt.index).trim();
  }

  const bare = t.replace(/^\//, "");
  if (KEYWORDS[bare]) return { command: KEYWORDS[bare], format };

  const m = t.match(
    /^(?:please\s+)?(?:send|give|get|show)(?:\s+me)?(?:\s+(?:my|the|a))?\s+([a-z ]{2,20})$/,
  );
  if (m && KEYWORDS[m[1].trim()]) return { command: KEYWORDS[m[1].trim()], format };

  return null;
}

const HELP = `I file anything you send me (text or voice) into your OS — tasks, calendar events, journal, notes. Captures with a date/time land on the calendar or get a due date automatically, and every confirmation has "move" buttons if I filed it wrong.

On request I can also send:
• cv — your resume (.docx, or "cv pdf")
• briefing — today's morning briefing (add "pdf" for a file)
• now — what you should be doing right now, and what's next
• tasks — today's open tasks
• events — your calendar for the next 7 days
• spending — assets & this month's spending
• backup — full JSON export of your data

Just say the word (or "send me my cv as pdf").`;

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Render a composed text either in-chat or as a generated PDF document. */
async function replyTextOrPdf(
  token: string,
  chatId: number | string,
  format: CommandFormat,
  body: string,
  pdfName: string,
): Promise<void> {
  if (format === "pdf" || format === "docx") {
    const buffer = format === "pdf" ? await textToPdf(body) : await textToDocx(body);
    await tgSendDocument(token, chatId, {
      buffer,
      filename: `${pdfName}-${localDateKey()}.${format}`,
    });
    return;
  }
  await tgSendLongMessage(token, chatId, body);
}

/** "9:30 AM" in the operator's timezone for a stored UTC instant. */
function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: USER_TIMEZONE,
  });
}

async function composeEvents(): Promise<string> {
  const today = localDateKey();
  const until = localDateKey(new Date(Date.now() + 7 * 86_400_000));
  const { events } = await buildCalendar(today, until);
  if (events.length === 0) return `Nothing on the calendar through ${until}.`;

  const dayOf = (e: { start: string; allDay: boolean }) =>
    e.allDay ? e.start.slice(0, 10) : localDateKey(new Date(e.start));
  const byDay = new Map<string, typeof events>();
  for (const e of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    const day = dayOf(e);
    if (day < today || day > until) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  const lines: string[] = [`Next 7 days (${today} → ${until}):`];
  for (const [day, dayEvents] of [...byDay.entries()].sort()) {
    const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    lines.push("", `${label}${day === today ? " (today)" : ""}`);
    for (const e of dayEvents) {
      lines.push(`• ${e.allDay ? "all day" : localTime(e.start)} — ${e.title}`);
    }
  }
  return lines.join("\n");
}

/**
 * Execute a matched command, replying in-chat. Privacy invariant: Telegram is
 * treated like the locked dashboard — assets and spending only, never debts,
 * cards, or net worth (those live behind the Finance PIN).
 */
export async function runCommand(
  matched: MatchedCommand,
  token: string,
  chatId: number | string,
): Promise<void> {
  const { command, format } = matched;
  switch (command) {
    case "help": {
      await tgSendMessage(token, chatId, HELP);
      return;
    }

    case "cv": {
      const resume = await getResume();
      if (!resume.full_text) {
        await tgSendMessage(
          token,
          chatId,
          "No resume stored yet — add it in the Me tab first.",
        );
        return;
      }
      // CV defaults to a Word file (editable); "cv pdf" sends a PDF instead.
      const asPdf = format === "pdf";
      const buffer = asPdf
        ? await textToPdf(resume.full_text)
        : await textToDocx(resume.full_text);
      await tgSendDocument(token, chatId, {
        buffer,
        filename: `cv-${localDateKey()}.${asPdf ? "pdf" : "docx"}`,
        caption: resume.updated_at
          ? `Your CV (last updated ${resume.updated_at.slice(0, 10)})`
          : "Your CV",
      });
      return;
    }

    case "briefing": {
      const briefing = await composeBriefing();
      await replyTextOrPdf(token, chatId, format, briefing, "briefing");
      return;
    }

    case "now": {
      await tgSendMessage(token, chatId, await composeNow());
      return;
    }

    case "events": {
      const body = await composeEvents();
      await replyTextOrPdf(token, chatId, format, body, "calendar");
      return;
    }

    case "tasks": {
      const tasks = await queryTasks({ urgency: "today", status: "open" });
      if (tasks.length === 0) {
        await tgSendMessage(token, chatId, "Nothing open for today. 🎉");
        return;
      }
      const lines = tasks
        .slice(0, 25)
        .map((t) => `• ${t.title}${t.course_name ? ` (${courseCode(t.course_name)})` : ""}`);
      const body = `Open today (${tasks.length}):\n${lines.join("\n")}`;
      await replyTextOrPdf(token, chatId, format, body, "tasks");
      return;
    }

    case "spending": {
      const overview = await buildFinanceOverview();
      const top = [...overview.spending.categories]
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 5)
        .map(
          (c) =>
            `• ${c.category}: ${money(c.spent)}${c.over ? " ⚠️ over budget" : ""}`,
        );
      const body = [
        `Cash & savings: ${money(overview.assets)}`,
        `Spent in ${overview.spending.month}: ${money(overview.spending.total)}`,
        ...(top.length ? ["", "Top categories:", ...top] : []),
        "",
        "Debt & net worth stay behind the PIN — check the Finance tab.",
      ].join("\n");
      await replyTextOrPdf(token, chatId, format, body, "spending");
      return;
    }

    case "backup": {
      // Telegram chats live on Telegram's servers — buildSharingSnapshot
      // centralizes what may leave the app (no Plaid tokens, no card data, no
      // private entries). Full snapshots
      // stay in the private Supabase backups bucket (cron / Me tab).
      const snapshot = await buildSharingSnapshot();

      const buffer = Buffer.from(JSON.stringify(snapshot, null, 2), "utf8");
      const stamp = snapshot.generated_at.slice(0, 19).replace(/[:]/g, "-");
      await tgSendDocument(token, chatId, {
        buffer,
        filename: `personal-os-export-${stamp}.json`,
        caption:
          "Data export (excludes Plaid tokens, card data, and private entries — those stay in the app's own backups).",
      });
      return;
    }
  }
}
