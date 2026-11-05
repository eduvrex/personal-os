import "server-only";

import { db, USER_ID } from "@/lib/db";
import { createTask } from "@/lib/tasks";
import { asObject, optStr, reqStr, ValidationError } from "@/lib/validate";
import type { AkrovEmailDTO } from "@/lib/types";

/**
 * Akrov email feed. Items forwarded from the Akrov Gmail account land in
 * `entities` as kind='akrov_email' (no migration needed): `name` carries the
 * subject; `metadata` carries {msg_id, from, date, snippet, status}. The
 * Gmail message id makes ingest idempotent — the Apps Script forwarder can
 * re-send a batch without creating duplicates. Status lifecycle:
 * new → converted (became a task) | dismissed. Rows are kept after
 * conversion/dismissal so re-forwarded ids stay deduped.
 */

const KIND = "akrov_email";
const LIST_CAP = 50;

interface EmailMeta {
  msg_id?: string;
  from?: string;
  date?: string;
  snippet?: string;
  status?: string;
}

function toDTO(r: { id: string; name: string; metadata: unknown; created_at: string }): AkrovEmailDTO {
  const m = (r.metadata ?? {}) as EmailMeta;
  return {
    id: r.id,
    subject: r.name,
    from: m.from ?? null,
    date: m.date ?? null,
    snippet: m.snippet ?? null,
    status: m.status === "converted" || m.status === "dismissed" ? m.status : "new",
    created_at: r.created_at,
  };
}

/** Unhandled (status=new) email items, newest first. */
export async function listEmailItems(): Promise<AkrovEmailDTO[]> {
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

export interface IngestEmailItem {
  id: string;
  subject: string;
  from: string | null;
  date: string | null;
  snippet: string | null;
}

/** Validate the forwarder's POST body: { items: [{id, subject, from?, date?, snippet?}] }. */
export function parseIngestBody(raw: unknown): IngestEmailItem[] {
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

/** Idempotent upsert by Gmail message id. Returns how many were new. */
export async function ingestEmailItems(
  items: IngestEmailItem[],
): Promise<{ received: number; inserted: number }> {
  if (items.length === 0) return { received: 0, inserted: 0 };
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
  if (fresh.length > 0) {
    const { error } = await db()
      .from("entities")
      .insert(
        fresh.map((i) => ({
          user_id: USER_ID,
          kind: KIND,
          name: i.subject,
          metadata: {
            msg_id: i.id,
            from: i.from,
            date: i.date,
            snippet: i.snippet,
            status: "new",
          },
        })),
      );
    if (error) throw new Error(error.message);
  }
  return { received: items.length, inserted: fresh.length };
}

async function setStatus(id: string, status: "converted" | "dismissed"): Promise<EmailMeta> {
  const { data, error } = await db()
    .from("entities")
    .select("id,metadata")
    .eq("user_id", USER_ID)
    .eq("kind", KIND)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ValidationError("Email item not found.");
  const meta = { ...((data.metadata ?? {}) as EmailMeta), status };
  const upd = await db().from("entities").update({ metadata: meta }).eq("id", id);
  if (upd.error) throw new Error(upd.error.message);
  return meta;
}

/** Turn an email item into an akrov-domain inbox task; item leaves the lane. */
export async function convertEmailToTask(id: string): Promise<{ taskId: string }> {
  const { data, error } = await db()
    .from("entities")
    .select("id,name")
    .eq("user_id", USER_ID)
    .eq("kind", KIND)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ValidationError("Email item not found.");
  const task = await createTask({ title: data.name, domain: "akrov", urgency: "inbox" });
  await setStatus(id, "converted");
  return { taskId: task.id };
}

export async function dismissEmail(id: string): Promise<void> {
  await setStatus(id, "dismissed");
}
