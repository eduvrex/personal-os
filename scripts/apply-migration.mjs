// One-off migration runner. Applies a SQL file to Supabase Postgres using a
// direct connection string (SUPABASE_DB_URL), since DDL can't go through the
// PostgREST service-role API.
//
// Usage: node scripts/apply-migration.mjs supabase/migrations/0001_finance.sql
import { readFileSync } from "node:fs";
import pg from "pg";

function envVal(name) {
  try {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch {
    return "";
  }
}

const file = process.argv[2] || "supabase/migrations/0001_finance.sql";
const url = process.env.SUPABASE_DB_URL || envVal("SUPABASE_DB_URL");

if (!url) {
  console.error(
    "SUPABASE_DB_URL is not set (env or .env.local). Get it from Supabase:\n" +
      "  Settings → Database → Connection string → URI",
  );
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log(`✅ Applied ${file}`);
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
