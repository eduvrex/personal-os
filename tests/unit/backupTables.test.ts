import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: () => ({}), USER_ID: "eduardo" }));

import { TABLES } from "@/lib/backup";

/**
 * THE BACKUP DRIFT GUARD: backup.ts's TABLES list is hand-maintained and has
 * silently drifted before (the health/fitness tables were missing until
 * recently). This test parses every `create table if not exists <name>` out
 * of supabase/migrations/*.sql and asserts each one is in TABLES, so a new
 * migration can't ship a table the backup silently skips.
 *
 * The invariant is one-directional: migration tables ⊆ TABLES. Tables created
 * outside migrations (e.g. by hand) may appear in TABLES without a migration.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

function migrationTables(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const match of sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+"?([a-zA-Z0-9_]+)"?/gi)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

describe("backup TABLES covers every migration-created table", () => {
  it("finds tables in the migrations (parser sanity check)", () => {
    expect(migrationTables().length).toBeGreaterThan(0);
  });

  it("every `create table if not exists` in supabase/migrations is backed up", () => {
    const backed = new Set<string>(TABLES);
    const missing = migrationTables().filter((t) => !backed.has(t));
    expect(
      missing,
      `tables created by migrations but absent from backup.ts TABLES: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
