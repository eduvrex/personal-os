import "server-only";

import { anthropicClient, lightModel, openaiClient, textFrom } from "@/lib/ai";
import { localDateKey, USER_TIMEZONE } from "@/lib/localDate";
import type { CaptureRoute } from "@/lib/types";

/**
 * Decide where a free-text capture should go — and pull out the structure the
 * destination needs (a clean title, a calendar date, a start time).
 *
 * Resolution order, each falling through to the next on absence/error:
 *   1. Claude (ANTHROPIC_MODEL) — primary, best judgement
 *   2. OpenAI — fallback
 *   3. Regex keyword rules + deterministic date parsing — last resort
 *
 * `extractCapture(text)` is the single entry point used by the capture
 * pipeline (web form + Telegram). Keep it stable: callers never need to know
 * which backend answered.
 */

const ROUTES: CaptureRoute[] = [
  "personal", "journal", "task", "event", "note", "plan", "reading", "application",
];

export interface CaptureExtraction {
  route: CaptureRoute;
  /** Exact clause represented by this item when one message contains several intents. */
  text?: string;
  /** Clean short title for tasks/events; null for journal/personal/note. */
  title: string | null;
  /** Event date or task deadline as YYYY-MM-DD, null when none stated. */
  date: string | null;
  /** Event start time as HH:MM (24h), null when none stated. */
  time: string | null;
  /** Which backend answered — stored on the raw capture for debugging. */
  llm: "claude" | "openai" | "regex" | "guard";
  /** Model certainty from 0–1; deterministic routes use a conservative fixed value. */
  confidence?: number;
  /** Optional task placement metadata. Course is matched to an existing entity. */
  domain?: "school" | "personal" | null;
  course?: string | null;
  /** Optional destination-specific metadata. */
  organization?: string | null;
  author?: string | null;
  applicationKind?: "masters" | "job" | "campus_job" | null;
}

function classifierPrompt(): string {
  const today = localDateKey();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: USER_TIMEZONE,
    weekday: "long",
  }).format(new Date());
  return `You extract structure from a person's quick capture. Today is ${weekday}, ${today} (timezone ${USER_TIMEZONE}).

Buckets (one message may contain several independent items):
- "event": something that happens at a scheduled date and/or time the person attends — appointment, meeting, dinner, flight, class, interview.
- "task": an actionable to-do or reminder (submit, email, call, finish, buy, errands). A deadline makes it a task with a date, not an event.
- "personal": a clearly personal or emotional reflection — feelings about relationships, sadness, loneliness, missing someone, heartbreak, anxiety, mental health, distress. Vulnerable, private-feeling writing.
- "journal": a lighter reflection or note about how their day/work/life went.
- "note": anything else worth keeping — an idea, fact, or observation.
- "plan": a new goal, project, or longer-term outcome (not merely its next action).
- "reading": a book the person wants to read, started, or finished.
- "application": a specific job, university, or program application to track.

Reply with ONLY minified JSON, no prose:
{"items":[{"text":<exact source clause>,"route":"task|event|personal|journal|note|plan|reading|application","title":<string or null>,"date":<"YYYY-MM-DD" or null>,"time":<"HH:MM" or null>,"confidence":<0 to 1>,"domain":"school|personal|null","course":<existing course name if stated, else null>,"organization":<employer/school for an application, else null>,"author":<book author, else null>,"applicationKind":"masters|job|campus_job|null"}]}

Rules:
- Split independent actions/events into separate items, in source order; maximum 5. Do not split a single compound title.
- confidence measures routing certainty. Use below 0.6 when two destinations are genuinely plausible.
- title: a clean short title for tasks/events/plans/books/applications (drop lead-ins and date/time words). null for journal/personal/note.
- date: the event date or task due date resolved to a real calendar date using today's date ("tomorrow", "Friday", "next week" → concrete dates; never invent one that isn't stated or clearly implied).
- time: 24-hour start time when stated ("3pm" → "15:00"), else null.`;
}

const DATE_RE_STRICT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE_STRICT = /^\d{2}:\d{2}$/;

/** Reject calendar-shaped strings such as 2026-99-40 rather than persisting them. */
function isDateKey(value: string): boolean {
  if (!DATE_RE_STRICT.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Validate a 24-hour clock value, not merely its string shape. */
function isTimeValue(value: string): boolean {
  if (!TIME_RE_STRICT.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/** Coerce a model's JSON reply to a validated extraction, or null. */
function coerceExtraction(
  parsed: unknown,
  llm: CaptureExtraction["llm"],
): CaptureExtraction | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const route = ROUTES.find((r) => r === obj.route);
  if (!route) return null;
  const title =
    typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : null;
  const date = typeof obj.date === "string" && isDateKey(obj.date) ? obj.date : null;
  const time = typeof obj.time === "string" && isTimeValue(obj.time) ? obj.time : null;
  const confidence = typeof obj.confidence === "number"
    ? Math.max(0, Math.min(1, obj.confidence))
    : undefined;
  const domain = obj.domain === "school" || obj.domain === "personal" ? obj.domain : undefined;
  const applicationKind = ["masters", "job", "campus_job"].includes(String(obj.applicationKind))
    ? (obj.applicationKind as CaptureExtraction["applicationKind"])
    : undefined;
  const optionalText = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  const sourceText = optionalText(obj.text);
  const course = optionalText(obj.course);
  const organization = optionalText(obj.organization);
  const author = optionalText(obj.author);
  return {
    route, title, date, time, llm,
    ...(sourceText ? { text: sourceText } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(domain ? { domain } : {}),
    ...(course ? { course } : {}),
    ...(organization ? { organization } : {}),
    ...(author ? { author } : {}),
    ...(applicationKind ? { applicationKind } : {}),
  };
}

function parsedJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** Parse one model item, accepting the v3 `{items:[…]}` wrapper as well. */
export function parseExtraction(
  raw: string | null | undefined,
  llm: CaptureExtraction["llm"],
): CaptureExtraction | null {
  return parseExtractions(raw, llm)?.[0] ?? null;
}

/** Coerce a model reply into at most five independently routed items. */
export function parseExtractions(
  raw: string | null | undefined,
  llm: CaptureExtraction["llm"],
): CaptureExtraction[] | null {
  const parsed = parsedJson(raw);
  if (!parsed) return null;
  const candidates = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : [parsed];
  const items = candidates.slice(0, 5).map((item) => coerceExtraction(item, llm)).filter(Boolean) as CaptureExtraction[];
  return items.length ? items : null;
}

/**
 * Reply budget. The prompt asks for up to FIVE items, each repeating its exact
 * source clause plus title/date/metadata — a 3-item capture already runs past
 * the old 200-token cap, truncating the JSON so the parse failed and the whole
 * pipeline silently fell through to the regex router. Five worst-case items
 * fit comfortably under 1024; output tokens are only billed as generated.
 */
export const CLASSIFIER_MAX_TOKENS = 1024;

async function extractWithClaude(text: string): Promise<CaptureExtraction[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = anthropicClient({ timeoutMs: 15_000, maxRetries: 1 });
  const res = await client.messages.create({
    model: lightModel(),
    max_tokens: CLASSIFIER_MAX_TOKENS,
    system: classifierPrompt(),
    messages: [{ role: "user", content: text }],
  });
  return parseExtractions(textFrom(res), "claude");
}

async function extractWithOpenAI(text: string): Promise<CaptureExtraction[] | null> {
  const client = openaiClient({ timeoutMs: 15_000, maxRetries: 1 });
  if (!client) return null;
  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    max_tokens: CLASSIFIER_MAX_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: classifierPrompt() },
      { role: "user", content: text },
    ],
  });
  return parseExtractions(res.choices[0]?.message?.content, "openai");
}

// ---------------------------------------------------------------------------
// Deterministic fallback — keyword routing + date/time parsing
// ---------------------------------------------------------------------------

const TASK_RE =
  /\b(remind|todo|to-do|submit|email|call|book|buy|pay|finish|due|deadline|assignment|read|study|problem set)\b/;
const PERSONAL_RE =
  /\b(miss(ing)?\s+(her|him|them|you|my)|my love|lonely|alone|heartbroken|heartbreak|broke ?up|breakup|my ex\b|cried|crying|depress|anxious|anxiety|hopeless|worthless|self-?harm|suicid|grief|grieving|hurting|empty inside|can'?t cope)\b/i;
const JOURNAL_RE =
  /\b(felt|feeling|today was|grateful|tired|proud|reflect|mood|stressed|happy)\b/;
const EVENT_RE =
  /\b(appointment|meeting|meet(ing)?\s+with|dinner|lunch|coffee|brunch|flight|train\s+to|concert|interview|doctor|dentist|haircut|class|lecture|exam|call\s+with|party|viewing)\b/i;

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Shift a YYYY-MM-DD key by whole days (string-space arithmetic, no TZ). */
function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic "when" parser for the regex fallback: finds a date and/or a
 * start time in free text, relative to `todayKey` (YYYY-MM-DD). Handles
 * today/tonight/tomorrow, weekday names ("next" = same next occurrence),
 * "July 15" / "15 July", ISO dates, and times like "3pm", "15:30", "noon".
 */
export function parseWhen(
  text: string,
  todayKey: string = localDateKey(),
): { date: string | null; time: string | null } {
  // Voice transcription commonly emits "p.m."/"a.m."; normalize those to the
  // same representation as typed captures before applying the clock regexes.
  const low = text.toLowerCase().replace(/\b([ap])\s*\.\s*m\.?/g, "$1m");
  let date: string | null = null;

  const iso = low.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) date = iso[1];

  if (!date && /\b(today|tonight)\b/.test(low)) date = todayKey;
  if (!date && /\bday after tomorrow\b/.test(low)) date = shiftDateKey(todayKey, 2);
  if (!date && /\b(tomorrow|tmrw)\b/.test(low)) date = shiftDateKey(todayKey, 1);

  if (!date) {
    const relative = low.match(/\bin\s+(\d{1,3})\s+(day|days|week|weeks)\b/);
    if (relative) {
      const multiplier = relative[2].startsWith("week") ? 7 : 1;
      date = shiftDateKey(todayKey, Number(relative[1]) * multiplier);
    }
  }

  if (!date && /\bnext week\b/.test(low)) date = shiftDateKey(todayKey, 7);

  if (!date) {
    const dow = low.match(
      /\b(?:next\s+|on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
    );
    if (dow) {
      const todayDow = new Date(`${todayKey}T12:00:00Z`).getUTCDay();
      let gap = (WEEKDAYS.indexOf(dow[1]) - todayDow + 7) % 7;
      if (gap === 0) gap = 7; // "friday" said on a Friday means next week
      date = shiftDateKey(todayKey, gap);
    }
  }

  if (!date) {
    // "july 15" / "15 july" / "jul 15th" — this year, rolling to next year if past.
    const monthNames = MONTHS.map((m) => m.slice(0, 3)).join("|");
    const m1 = low.match(new RegExp(`\\b(${monthNames})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    const m2 = low.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})[a-z]*\\b`));
    const month = m1 ? m1[1] : m2 ? m2[2] : null;
    const day = m1 ? Number(m1[2]) : m2 ? Number(m2[1]) : null;
    if (month && day && day >= 1 && day <= 31) {
      const mi = MONTHS.findIndex((m) => m.startsWith(month));
      const year = Number(todayKey.slice(0, 4));
      const candidate = `${year}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      date = candidate >= todayKey ? candidate : `${year + 1}${candidate.slice(4)}`;
    }
  }

  let time: string | null = null;
  const t12 = low.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const t24 = low.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (t12) {
    let h = Number(t12[1]) % 12;
    if (t12[3] === "pm") h += 12;
    time = `${String(h).padStart(2, "0")}:${t12[2] ?? "00"}`;
  } else if (t24) {
    time = `${t24[1].padStart(2, "0")}:${t24[2]}`;
  } else if (/\bnoon\b/.test(low)) {
    time = "12:00";
  } else if (/\bmidnight\b/.test(low)) {
    time = "00:00";
  }

  return { date, time };
}

/** Deterministic keyword router — the always-available last resort. */
export function classifyWithRegex(text: string): CaptureRoute {
  const low = text.toLowerCase();
  const { date, time } = parseWhen(low);
  if (EVENT_RE.test(low) && (date || time)) return "event";
  if (TASK_RE.test(low)) return "task";
  if (PERSONAL_RE.test(low)) return "personal";
  if (date && time) return "event"; // "haircut friday 4pm" — scheduled, no keyword
  if (JOURNAL_RE.test(low)) return "journal";
  return "note";
}

function extractWithRegexRules(text: string): CaptureExtraction {
  const route = classifyWithRegex(text);
  const { date, time } = parseWhen(text);
  const needsTitle = route === "task" || route === "event";
  return {
    route,
    text: text.trim(),
    title: needsTitle ? cleanCaptureTitle(text) || text.trim() : null,
    date: route === "task" || route === "event" ? date : null,
    time: route === "task" || route === "event" ? time : null,
    llm: "regex",
    confidence: route === "note" ? 0.55 : 0.72,
    domain: route === "task" && looksLikeSchool(text) ? "school" : "personal",
  };
}

const GREETINGS = new Set([
  "hello", "hi", "hey", "hiya", "yo", "sup", "hola", "ola",
  "ok", "okay", "k", "kk", "cool", "nice", "thanks", "thank you", "ty",
  "test", "testing", "ping", "hey there", "good morning", "good night",
  "gm", "gn", "lol", "haha",
]);

/**
 * Guard against greetings / gibberish / commands becoming tasks. Returns "note"
 * for those (slash-commands are treated as notes, never tasks), or null to let
 * the AI classify normally.
 */
export function guardRoute(text: string): CaptureRoute | null {
  const trimmed = text.trim();
  if (!trimmed) return "note";
  // Slash-commands (e.g. "/start") are never tasks.
  if (trimmed.startsWith("/")) return "note";
  const low = trimmed.toLowerCase().replace(/[!.?,]+$/, "");
  if (GREETINGS.has(low)) return "note";
  const words = low.split(/\s+/).filter(Boolean);
  // Very short and not obviously actionable → default to a note.
  if (words.length <= 2 && !TASK_RE.test(low)) return "note";
  return null;
}

/**
 * The single classification + extraction entry point for the capture pipeline.
 */
export async function extractCaptures(text: string): Promise<CaptureExtraction[]> {
  const guarded = guardRoute(text);
  if (guarded) return [{ route: guarded, text, title: null, date: null, time: null, llm: "guard", confidence: 1 }];
  try {
    const viaClaude = await extractWithClaude(text);
    if (viaClaude) return viaClaude.map((item) => reconcileExtraction(item.text ?? text, item));
  } catch {
    /* fall through to OpenAI */
  }
  try {
    const viaOpenAI = await extractWithOpenAI(text);
    if (viaOpenAI) return viaOpenAI.map((item) => reconcileExtraction(item.text ?? text, item));
  } catch {
    /* fall through to regex */
  }
  const clauses = text
    .split(/\n\s*(?:[-*•]\s*)?|\s*;\s*|\s+\b(?:and also|also remind me|then remind me)\b\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);
  return (clauses.length ? clauses : [text]).map(extractWithRegexRules);
}

/** Backward-compatible single-item entry point. */
export async function extractCapture(text: string): Promise<CaptureExtraction> {
  return (await extractCaptures(text))[0];
}

/**
 * Reconcile probabilistic model output with facts we can extract exactly from
 * the source text. This prevents a valid-but-incomplete JSON reply from
 * silently dropping an explicit deadline such as "tomorrow at 5 p.m.".
 */
export function reconcileExtraction(
  text: string,
  extraction: CaptureExtraction,
  todayKey?: string,
): CaptureExtraction {
  if (extraction.route !== "task" && extraction.route !== "event") {
    return extraction.route === "plan" || extraction.route === "reading" || extraction.route === "application"
      ? { ...extraction, title: extraction.title || cleanCaptureTitle(text) || text.trim() }
      : { ...extraction, title: null, date: null, time: null };
  }

  const deterministic = parseWhen(text, todayKey);
  return {
    ...extraction,
    title: extraction.title || cleanCaptureTitle(text) || text.trim(),
    // Prefer source-grounded parsing when it recognizes an explicit value;
    // otherwise retain the model's value for language the parser does not know.
    date: deterministic.date ?? extraction.date,
    time: deterministic.time ?? extraction.time,
  };
}

/** Route-only convenience wrapper (kept for callers that ignore structure). */
export async function classifyCapture(text: string): Promise<CaptureRoute> {
  return (await extractCapture(text)).route;
}

const SCHOOL_RE =
  /\b(cs|calc|calculus|history|essay|lab|problem set|read chapter|assignment)\b/i;

/** Heuristic: does this task text look like coursework? */
export function looksLikeSchool(text: string): boolean {
  return SCHOOL_RE.test(text);
}

/** Strip "remind me to" / "todo:" lead-ins so the task title reads cleanly. */
export function cleanTaskTitle(text: string): string {
  return text
    .replace(/^remind me to /i, "")
    .replace(/^todo:?\s*/i, "")
    .trim();
}

/**
 * Produce a compact task/event title for the deterministic fallback. The raw
 * utterance remains on raw_captures, so removing scheduling prose here loses
 * no information and avoids titles such as "… tomorrow. It's due at 5 p.m.".
 */
export function cleanCaptureTitle(text: string): string {
  return cleanTaskTitle(text)
    .replace(/^i\s+(?:need|have|want)\s+to\s+/i, "")
    .replace(/\s*[.!?]\s*(?:it(?:'s| is)\s+)?due\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:by|on|this|next)?\s*(?:today|tonight|tomorrow|tmrw|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:at|by)\s+\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\.?(?:\s|$)[\s\S]*$/i, "")
    .replace(/[\s,.;:!?-]+$/g, "")
    .trim();
}
