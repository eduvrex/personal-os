import "server-only";

import { db, USER_ID } from "@/lib/db";
import { createTask } from "@/lib/tasks";
import { tgSendMessage } from "@/lib/telegram";
import { asObject, optStr, reqStr, ValidationError } from "@/lib/validate";
import type { JobEmailDTO } from "@/lib/types";

/**
 * Job-search email feed. Mail forwarded from the dedicated job-search Gmail
 * account lands in `entities` as kind='job_email' (no migration needed), the
 * same shape the Akrov feed uses: `name` carries the subject, `metadata`
 * carries {msg_id, from, date, snippet, status, application_id, matched_org}.
 * The Gmail message id makes ingest idempotent, so the Apps Script forwarder
 * can re-send a batch without creating duplicates.
 *
 * What this adds over the Akrov feed: on ingest each item is matched against
 * the `applications` table, so a reply from a company he applied to attaches
 * itself to that application row and can raise an alert. Matching is a hint,
 * never a mutation of the application — status changes stay manual.
 *
 * Status lifecycle: new → converted (became a task) | dismissed. Rows are kept
 * after conversion/dismissal so re-forwarded ids stay deduped.
 */

const KIND = "job_email";
const LIST_CAP = 50;

/** Corporate filler that must never carry a match on its own. */
const STOP_TOKENS = new Set([
  "grupo", "group", "holding", "company", "compania", "consulting", "consultoria",
  "solutions", "services", "servicios", "people", "talento", "talent", "careers",
  "empleo", "jobs", "recruiting", "seleccion", "global", "international",
  "iberia", "espana", "spain", "madrid", "barcelona", "copenhagen",
  "financial", "financiera", "financiero", "finance", "finanzas",
  "bank", "banco", "capital", "partners", "hotel", "hoteles",
  "sl", "sa", "slu", "sau", "sociedad", "the", "and", "for",
]);

interface EmailMeta {
  msg_id?: string;
  from?: string;
  date?: string;
  snippet?: string;
  status?: string;
  application_id?: string | null;
  matched_org?: string | null;
  /** Set when the noise filter auto-dismissed this item. */
  noise?: boolean;
  /** Outcome the triage pass read out of the subject/snippet. */
  outcome?: string | null;
}

/** Lowercase, strip accents, collapse to spaces. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distinctive tokens of an organisation name, longest first. */
function orgTokens(org: string): string[] {
  return norm(org)
    .split(" ")
    .filter((t) => t.length >= 4 && !STOP_TOKENS.has(t))
    .sort((a, b) => b.length - a.length);
}

/**
 * The org name as a contiguous phrase, when it is distinctive enough to carry a
 * match on its own. "Ally Financial" → "ally financial": neither token is
 * distinctive (one is 4 chars, the other is corporate filler), but the pair is.
 * Returns "" when the name is a single word or too short to be safe.
 */
function orgPhrase(org: string): string {
  const phrase = norm(org);
  if (phrase.split(" ").length < 2 || phrase.length < 10) return "";
  return phrase;
}

/** "UNIR Talento <no-reply@unir.net>" → { display: "unir talento", core: "unir" } */
export function parseSender(from: string | null): { display: string; core: string } {
  if (!from) return { display: "", core: "" };
  const addr = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const display = norm(from.replace(/<[^>]*>/, ""));
  const host = (addr.split("@")[1] ?? "").toLowerCase().trim();
  if (!host) return { display, core: "" };
  const parts = host.split(".").filter(Boolean);
  // Drop the TLD (and a country second-level like .co.uk / .com.mx).
  let core = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? "";
  if (core.length <= 3 && parts.length >= 3) core = parts[parts.length - 3];
  return { display, core: norm(core).replace(/ /g, "") };
}

export interface ApplicationRef {
  id: string;
  org: string;
}

/**
 * Best application match for an inbound email, or null.
 *
 * Strong signal: the sender's registrable domain. `unir.net` → core "unir"
 * matches the org token "unir"; `managementsolutions.com` → core
 * "managementsolutions" contains "management". A 4-character token only ever
 * matches through the domain — short words like "unir" are ordinary Spanish
 * and would false-positive against subject text.
 *
 * Middle signal: the full org name as a contiguous phrase in the display name
 * or subject ("ally financial"), which is distinctive even when no single token
 * in it is.
 *
 * Weaker signal: a distinctive token (5+ chars) appearing as a whole word in
 * the sender's display name or the subject.
 */
export function matchApplication(
  from: string | null,
  subject: string,
  apps: ApplicationRef[],
): ApplicationRef | null {
  const { display, core } = parseSender(from);
  const haystack = ` ${display} ${norm(subject)} `;
  let best: { app: ApplicationRef; score: number } | null = null;

  for (const app of apps) {
    const tokens = orgTokens(app.org);
    if (tokens.length === 0) continue;
    const compact = tokens.join("");
    let score = 0;

    if (core) {
      if (core === compact || compact.includes(core) || core.includes(compact)) score = 100;
      else {
        for (const t of tokens) {
          if (core === t) { score = Math.max(score, 90); break; }
          if (core.includes(t)) score = Math.max(score, 80);
        }
      }
    }
    if (score === 0) {
      const phrase = orgPhrase(app.org);
      if (phrase && haystack.includes(` ${phrase} `)) score = 85;
    }
    if (score === 0) {
      for (const t of tokens) {
        if (t.length >= 5 && haystack.includes(` ${t} `)) {
          score = Math.max(score, 50 + t.length);
        }
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { app, score };
  }
  return best ? best.app : null;
}

function toDTO(r: { id: string; name: string; metadata: unknown; created_at: string }): JobEmailDTO {
  const m = (r.metadata ?? {}) as EmailMeta;
  return {
    id: r.id,
    subject: r.name,
    from: m.from ?? null,
    date: m.date ?? null,
    snippet: m.snippet ?? null,
    status: m.status === "converted" || m.status === "dismissed" ? m.status : "new",
    application_id: m.application_id ?? null,
    matched_org: m.matched_org ?? null,
    created_at: r.created_at,
  };
}

/** Unhandled (status=new) job-search email items, newest first. */
export async function listJobEmails(): Promise<JobEmailDTO[]> {
  const { data, error } = await db()
    .from("entities")
    .select("id,name,metadata,created_at")
    .eq("user_id", USER_ID)
    .eq("kind", KIND)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toDTO).filter((d) => d.status === "new").slice(0, LIST_CAP);
}

export interface IngestJobEmailItem {
  id: string;
  subject: string;
  from: string | null;
  date: string | null;
  snippet: string | null;
}

/** Validate the forwarder's POST body: { items: [{id, subject, from?, date?, snippet?}] }. */
export function parseIngestBody(raw: unknown): IngestJobEmailItem[] {
  const body = asObject(raw);
  const items = body.items;
  if (!Array.isArray(items)) throw new ValidationError("items must be an array.");
  if (items.length > 100) throw new ValidationError("At most 100 items per batch.");
  return items.map((it, i) => {
    const o = asObject(it);
    return {
      id: reqStr(o.id, `items[${i}].id`, 128),
      subject: reqStr(o.subject, `items[${i}].subject`, 300),
      from: optStr(o.from, `items[${i}].from`, 200),
      date: optStr(o.date, `items[${i}].date`, 40),
      snippet: optStr(o.snippet, `items[${i}].snippet`, 500),
    };
  });
}

export interface MatchedEmail {
  subject: string;
  from: string | null;
  org: string;
}

/** Idempotent upsert by Gmail message id, with application matching. */
export async function ingestJobEmails(
  items: IngestJobEmailItem[],
): Promise<{ received: number; inserted: number; matched: MatchedEmail[] }> {
  if (items.length === 0) return { received: 0, inserted: 0, matched: [] };

  const ids = items.map((i) => i.id);
  const existing = await db()
    .from("entities")
    .select("metadata->>msg_id")
    .eq("user_id", USER_ID)
    .eq("kind", KIND)
    .in("metadata->>msg_id", ids);
  if (existing.error) throw new Error(existing.error.message);
  const seen = new Set(
    (existing.data ?? []).map((r) => (r as Record<string, unknown>)["msg_id"] as string),
  );
  const fresh = items.filter((i) => !seen.has(i.id));
  if (fresh.length === 0) return { received: items.length, inserted: 0, matched: [] };

  const appRows = await db()
    .from("applications")
    .select("id,org")
    .eq("user_id", USER_ID)
    .not("org", "is", null);
  if (appRows.error) throw new Error(appRows.error.message);
  const apps: ApplicationRef[] = (appRows.data ?? [])
    .map((r) => ({ id: String(r.id), org: String(r.org ?? "") }))
    .filter((a) => a.org.length > 0);

  const matched: MatchedEmail[] = [];
  const rows = fresh.map((i) => {
    const hit = matchApplication(i.from, i.subject, apps);
    if (hit) matched.push({ subject: i.subject, from: i.from, org: hit.org });
    // Board marketing is dismissed on arrival — but never when it matched an
    // application, since recruiters do write from board-hosted addresses.
    const noise = !hit && isNoise(i.from, i.subject);
    return {
      user_id: USER_ID,
      kind: KIND,
      name: i.subject,
      metadata: {
        msg_id: i.id,
        from: i.from,
        date: i.date,
        snippet: i.snippet,
        status: noise ? "dismissed" : "new",
        noise,
        application_id: hit ? hit.id : null,
        matched_org: hit ? hit.org : null,
      },
    };
  });

  const { error } = await db().from("entities").insert(rows);
  if (error) throw new Error(error.message);
  return { received: items.length, inserted: fresh.length, matched };
}

/**
 * Ping Telegram when mail arrives from a company he has applied to.
 * Best-effort and never throws: a dead bot token must not fail the ingest.
 */
export async function alertMatched(matched: MatchedEmail[]): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_USER_ID;
  if (!token || !chatId || matched.length === 0) return 0;
  let sent = 0;
  for (const m of matched.slice(0, 5)) {
    const text = `Job search — reply from ${m.org}\n${m.subject}${m.from ? `\nfrom ${m.from}` : ""}`;
    try {
      await tgSendMessage(token, chatId, text);
      sent++;
    } catch {
      // Best-effort: the item is already stored and visible on /apply.
    }
  }
  return sent;
}

async function loadItem(id: string): Promise<{ id: string; name: string; meta: EmailMeta }> {
  const { data, error } = await db()
    .from("entities")
    .select("id,name,metadata")
    .eq("user_id", USER_ID)
    .eq("kind", KIND)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ValidationError("Email item not found.");
  return { id: data.id, name: data.name, meta: (data.metadata ?? {}) as EmailMeta };
}

async function patchMeta(id: string, patch: Partial<EmailMeta>): Promise<void> {
  const { meta } = await loadItem(id);
  const upd = await db()
    .from("entities")
    .update({ metadata: { ...meta, ...patch } })
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (upd.error) throw new Error(upd.error.message);
}

/** Turn an email item into a work-domain inbox task; item leaves the lane. */
export async function convertJobEmailToTask(id: string): Promise<{ taskId: string }> {
  const { name, meta } = await loadItem(id);
  const title = meta.matched_org ? `${meta.matched_org}: ${name}` : name;
  const task = await createTask({
    title: title.slice(0, 300),
    domain: "work",
    urgency: "inbox",
    tags: ["job-search"],
  });
  await patchMeta(id, { status: "converted" });
  return { taskId: task.id };
}

export async function dismissJobEmail(id: string): Promise<void> {
  await patchMeta(id, { status: "dismissed" });
}

/** Manually correct (or clear) the application an email belongs to. */
export async function linkJobEmail(id: string, applicationId: string | null): Promise<void> {
  if (applicationId === null) {
    await patchMeta(id, { application_id: null, matched_org: null });
    return;
  }
  const { data, error } = await db()
    .from("applications")
    .select("id,org")
    .eq("user_id", USER_ID)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ValidationError("Application not found.");
  await patchMeta(id, { application_id: String(data.id), matched_org: String(data.org ?? "") });
}


// ---------------------------------------------------------------------------
// Noise filter
// ---------------------------------------------------------------------------

/**
 * Job boards send far more marketing than mail from actual employers. These
 * senders and subjects are auto-dismissed on arrival so the lane only holds
 * things a person wrote (or an ATS sent on their behalf).
 *
 * Safety rule enforced by the callers, not here: an item matched to one of his
 * applications is NEVER auto-dismissed, whatever it looks like. A recruiter
 * replying from a board-hosted address must not be filtered away.
 */
const NOISE_SENDERS = [
  "push.infojobs.net",
  "comms.infojobs.net",
  "accounts.google.com",
  "jobalerts-noreply@linkedin.com",
  "jobs-listings@linkedin.com",
  "alerts@indeed.com",
  "noreply@glassdoor.com",
  "no-reply@glassdoor.com",
];

const NOISE_SUBJECTS = [
  "ofertas que te recomendamos",
  "ofertas para ti",
  "verifica tu email",
  "confirma tu email",
  "security alert",
  "alerta de seguridad",
  "newsletter",
  "boletin",
  "te has inscrito a una oferta",
  "jobs for you",
  "new jobs",
  "recomendaciones",
];

/** True when an item is job-board marketing or an account notice. */
export function isNoise(from: string | null, subject: string): boolean {
  const addr = (from ?? "").toLowerCase();
  if (NOISE_SENDERS.some((d) => addr.includes(d))) return true;
  const subj = ` ${norm(subject)} `;
  return NOISE_SUBJECTS.some((phrase) => subj.includes(` ${norm(phrase)} `));
}

// ---------------------------------------------------------------------------
// Outcome classifier
// ---------------------------------------------------------------------------

export type Outcome = "rejected" | "interview" | "offer" | "ack";

/**
 * Rejection is tested first and wins outright: a rejection letter routinely
 * contains "entrevista" or "proceso de selección" too, so any other order
 * misreads a no as a yes. Phrases are stored already normalised (accents
 * stripped) because `norm()` strips them from the haystack as well.
 */
const REJECT_PHRASES = [
  "no se ajusta", "no encaja", "no hemos seleccionado", "no ha sido seleccionado",
  "hemos decidido no", "no continuaremos", "no podemos seguir", "no seguimos adelante",
  "otro candidato", "otros candidatos", "no continuar con tu candidatura",
  "el proceso ha finalizado", "no continuamos",
  "not moving forward", "not be moving forward", "not selected", "unsuccessful",
  "not progressing", "will not be proceeding", "no longer under consideration",
  "decided to move forward with other",
];

const INTERVIEW_PHRASES = [
  "entrevista", "videollamada", "agendar una llamada", "concertar una",
  "siguiente fase", "siguiente etapa", "proxima fase", "prueba tecnica",
  "nos gustaria conocerte", "invitarte a una",
  "schedule a call", "schedule an interview", "interview", "next stage",
  "next round", "assessment",
];

const OFFER_PHRASES = [
  "oferta de empleo", "nos complace ofrecerte", "job offer", "pleased to offer",
];

const ACK_PHRASES = [
  "bienvenido al proceso", "bienvenida al proceso", "hemos recibido tu candidatura",
  "we have received your application", "application received", "tu candidatura ha sido recibida",
];

function hasAny(haystack: string, phrases: string[]): boolean {
  return phrases.some((p) => haystack.includes(norm(p)));
}

/** Read an outcome out of an email, or null when it says nothing decisive. */
export function classifyOutcome(subject: string, snippet: string | null): Outcome | null {
  const hay = norm(`${subject} ${snippet ?? ""}`);
  if (hasAny(hay, REJECT_PHRASES)) return "rejected";
  if (hasAny(hay, OFFER_PHRASES)) return "offer";
  if (hasAny(hay, INTERVIEW_PHRASES)) return "interview";
  if (hasAny(hay, ACK_PHRASES)) return "ack";
  return null;
}

// ---------------------------------------------------------------------------
// Daily triage
// ---------------------------------------------------------------------------

export interface TriageResult {
  scanned: number;
  dismissed: number;
  newlyMatched: number;
  applicationsUpdated: number;
  alerts: string[];
}

interface EntityRow {
  id: string;
  name: string;
  metadata: EmailMeta | null;
}

/**
 * Daily sweep over unhandled job emails. Three jobs, in order:
 *
 *  1. Re-match anything still unmatched — an application row added after the
 *     email arrived should retroactively claim it.
 *  2. Auto-dismiss board marketing that is not tied to an application.
 *  3. Read an outcome out of matched mail and move the application forward:
 *     a rejection closes it, an interview invitation promotes it.
 *
 * Application writes are deliberately conservative: a row already at
 * `decision` is never touched (a manual call outrules the classifier), and a
 * rejection records what it read in `decision` so the change is auditable.
 */
export async function triageJobEmails(): Promise<TriageResult> {
  const out: TriageResult = {
    scanned: 0, dismissed: 0, newlyMatched: 0, applicationsUpdated: 0, alerts: [],
  };

  const { data: rows, error } = await db()
    .from("entities")
    .select("id,name,metadata")
    .eq("user_id", USER_ID)
    .eq("kind", KIND)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);

  const items = ((rows ?? []) as EntityRow[]).filter(
    (r) => ((r.metadata ?? {}).status ?? "new") === "new",
  );
  out.scanned = items.length;
  if (items.length === 0) return out;

  const appRows = await db()
    .from("applications")
    .select("id,org,status")
    .eq("user_id", USER_ID)
    .not("org", "is", null);
  if (appRows.error) throw new Error(appRows.error.message);
  const apps = (appRows.data ?? []).map((r) => ({
    id: String(r.id),
    org: String(r.org ?? ""),
    status: String(r.status ?? "researching"),
  }));
  const byId = new Map(apps.map((a) => [a.id, a]));

  for (const item of items) {
    const meta = item.metadata ?? {};
    const patch: Partial<EmailMeta> = {};
    let appId = meta.application_id ?? null;

    // 1. retroactive matching
    if (!appId) {
      const hit = matchApplication(meta.from ?? null, item.name, apps);
      if (hit) {
        appId = hit.id;
        patch.application_id = hit.id;
        patch.matched_org = hit.org;
        out.newlyMatched++;
      }
    }

    // 2. noise — only ever for unmatched items
    if (!appId && isNoise(meta.from ?? null, item.name)) {
      patch.status = "dismissed";
      patch.noise = true;
      out.dismissed++;
      await patchMeta(item.id, patch);
      continue;
    }

    // 3. outcome
    if (appId) {
      const outcome = classifyOutcome(item.name, meta.snippet ?? null);
      if (outcome) patch.outcome = outcome;
      const app = byId.get(appId);
      if (app && outcome && outcome !== "ack" && app.status !== "decision") {
        const when = (meta.date ?? "").slice(0, 10);
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (outcome === "rejected") {
          update.status = "decision";
          update.decision = `Rechazado — "${item.name}" (${when})`;
          update.next_action = null;
          out.alerts.push(`Rejected: ${app.org}`);
        } else if (outcome === "interview") {
          if (app.status === "applying" || app.status === "applied") update.status = "interview";
          update.next_action = `Responder para agendar — "${item.name}" (${when})`;
          out.alerts.push(`Interview step: ${app.org}`);
        } else if (outcome === "offer") {
          update.next_action = `Posible oferta — revisar "${item.name}" (${when})`;
          out.alerts.push(`Possible offer: ${app.org}`);
        }
        const upd = await db()
          .from("applications")
          .update(update)
          .eq("user_id", USER_ID)
          .eq("id", appId);
        if (!upd.error) {
          out.applicationsUpdated++;
          app.status = (update.status as string) ?? app.status;
        }
      }
    }

    if (Object.keys(patch).length > 0) await patchMeta(item.id, patch);
  }

  // One Telegram message summarising real movement; silence on a quiet day.
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_USER_ID;
  if (token && chatId && out.alerts.length > 0) {
    try {
      await tgSendMessage(token, chatId, `Job search update\n${out.alerts.join("\n")}`);
    } catch {
      // Best-effort; the dashboard still shows the change.
    }
  }
  return out;
}
