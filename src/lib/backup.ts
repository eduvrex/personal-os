import "server-only";

import { db } from "@/lib/db";

/**
 * Every table included in a snapshot. Exported so
 * tests/unit/backupTables.test.ts can assert it never drifts behind the
 * migrations — add new tables here when a migration creates them.
 */
export const TABLES = [
  "entities", "raw_captures", "capture_artifacts", "telegram_updates", "tasks", "daily_logs", "journal_entries",
  "paths", "memory_chunks", "audit_log", "profile", "resume", "nudges",
  "applications", "plaid_items", "finance_accounts", "credit_cards",
  "transactions", "budgets", "event_categories", "calendar_events",
  "category_overrides", "canvas_courses", "canvas_assignments", "knowledge_base",
  "calendar_feeds", // feed URLs stay encrypted in snapshots (url_encrypted)
  "workouts",
  "rhythm_blocks", "rhythm_pings", "wishlist_items", "wishlist_settings", "meditation_sessions", "reading_books",
];

export interface Snapshot {
  generated_at: string;
  tables: Record<string, unknown[]>;
}

const PAGE = 1000;

/**
 * ADVISOR-ONLY private profile columns that must NEVER appear in an exported
 * snapshot — not the Telegram data export, not the private backups bucket. They
 * are re-seedable via SQL and quarantined everywhere else (see
 * tests/unit/academicPrivacy.test.ts). A
 * blanket `select("*")` on `profile` would otherwise carry them out verbatim.
 */
export const PRIVATE_PROFILE_COLUMNS = [
  "academic_context_private",
] as const;

/** Drop the advisor-only private columns from `profile` snapshot rows. Pure. */
export function stripPrivateProfileColumns(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const copy = { ...(row as Record<string, unknown>) };
    for (const col of PRIVATE_PROFILE_COLUMNS) delete copy[col];
    return copy;
  });
}

/**
 * Drop advisor-only 'private'-tier knowledge_base rows from a snapshot. The
 * public tier is fine to back up; private knowledge must never leave via an
 * export or the bucket. Pure.
 */
export function stripPrivateKnowledgeRows(rows: unknown[]): unknown[] {
  return rows.filter(
    (row) => !(row && typeof row === "object" && (row as { tier?: string }).tier === "private"),
  );
}

/**
 * Full JSON snapshot of every table. Paginates so large tables (transactions)
 * are complete, and THROWS on any read error — a backup silently missing a
 * table is worse than no backup. The `profile` table is redacted of its
 * advisor-only private columns before it ever enters the snapshot.
 */
export async function buildSnapshot(): Promise<Snapshot> {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db()
        .from(t)
        .select("*")
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`snapshot failed on ${t}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    // Strip advisor-only private data at the source, so EVERY snapshot consumer
    // (Telegram export + the backups bucket) is clean by construction.
    tables[t] =
      t === "profile"
        ? stripPrivateProfileColumns(rows)
        : t === "knowledge_base"
          ? stripPrivateKnowledgeRows(rows)
          : rows;
  }
  return { generated_at: new Date().toISOString(), tables };
}

/**
 * A snapshot fit to LEAVE the app (the Telegram "backup" command — chats live
 * on Telegram's servers). On top of buildSnapshot's always-on redactions it
 * drops Plaid items, card data, and private journal entries. Full
 * snapshots stay in the private backups bucket.
 */
export async function buildSharingSnapshot(): Promise<Snapshot> {
  const snapshot = await buildSnapshot();
  const EXCLUDED = [
    "plaid_items",
    "credit_cards",
  ];
  for (const t of EXCLUDED) delete snapshot.tables[t];
  snapshot.tables.journal_entries = (snapshot.tables.journal_entries ?? []).filter(
    (row) => !(row as { personal?: boolean }).personal,
  );
  return snapshot;
}

const BUCKET = "backups";
const KEEP = 14;

function storageBase(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1`;
}
function storageHeaders(): Record<string, string> {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function ensureBucket(): Promise<void> {
  // Idempotent — a 400/409 (already exists) is fine.
  await fetch(`${storageBase()}/bucket`, {
    method: "POST",
    headers: { ...storageHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  }).catch(() => {});
}

/** Write a timestamped snapshot to the private backups bucket; keep the last 14. */
export async function runBackup(): Promise<{ file: string; pruned: number }> {
  await ensureBucket();
  const snapshot = await buildSnapshot();
  const stamp = snapshot.generated_at.replace(/[:.]/g, "-");
  const file = `snapshot-${stamp}.json`;

  const up = await fetch(`${storageBase()}/object/${BUCKET}/${file}`, {
    method: "POST",
    headers: { ...storageHeaders(), "content-type": "application/json", "x-upsert": "true" },
    body: JSON.stringify(snapshot),
  });
  if (!up.ok) throw new Error(`backup upload failed: ${up.status} ${(await up.text()).slice(0, 200)}`);

  // Prune to the newest KEEP snapshots (ISO-stamped names sort chronologically).
  // Uses the bulk-delete endpoint: single-object DELETE rejects an empty JSON
  // body, and one request beats N.
  const listRes = await fetch(`${storageBase()}/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...storageHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ limit: 1000, prefix: "" }),
  });
  let pruned = 0;
  if (listRes.ok) {
    const items = (await listRes.json()) as { name: string }[];
    const stale = items
      .map((x) => x.name)
      .filter((n) => n.startsWith("snapshot-"))
      .sort()
      .reverse()
      .slice(KEEP);
    if (stale.length > 0) {
      const del = await fetch(`${storageBase()}/object/${BUCKET}`, {
        method: "DELETE",
        headers: { ...storageHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ prefixes: stale }),
      });
      if (del.ok) pruned = ((await del.json()) as unknown[]).length;
    }
  }
  return { file, pruned };
}
