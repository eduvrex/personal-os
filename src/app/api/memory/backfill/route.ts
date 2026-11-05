import { NextResponse } from "next/server";

import { db, USER_ID } from "@/lib/db";
import { addMemory, type MemorySourceType } from "@/lib/memory";
import { rateLimit, tooMany } from "@/lib/rateLimit";

/** Run async work over items with a small concurrency cap. */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<boolean>,
): Promise<number> {
  let indexed = 0;
  let ok = 0;
  async function worker() {
    while (indexed < items.length) {
      const i = indexed++;
      if (await fn(items[i])) ok++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return ok;
}

async function store(
  text: string | null,
  sourceType: MemorySourceType,
  sourceId: string,
): Promise<boolean> {
  if (!text || !text.trim()) return false;
  const res = await addMemory({ text, sourceType, sourceId });
  return res != null;
}

/**
 * One-time (idempotent via customId) push of all existing captures, tasks, and
 * journal entries into Supermemory.
 */
export async function POST() {
  // A full backfill re-embeds every capture/task/journal row — once per few
  // minutes is plenty, and this blocks a stuck client from hammering the API.
  const limit = rateLimit("memory-backfill", 1, 5 * 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(body, init);
  }
  const key = process.env.SUPERMEMORY_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "SUPERMEMORY_API_KEY is not configured." },
      { status: 503 },
    );
  }

  try {
    const [captures, tasks, journals] = await Promise.all([
      db().from("raw_captures").select("id,raw_text").eq("user_id", USER_ID),
      db().from("tasks").select("id,title,description").eq("user_id", USER_ID),
      db().from("journal_entries").select("id,text").eq("user_id", USER_ID),
    ]);
    for (const r of [captures, tasks, journals]) {
      if (r.error) throw new Error(r.error.message);
    }

    const captureCount = await mapLimit(captures.data ?? [], 5, (c) =>
      store(c.raw_text as string | null, "capture", c.id as string),
    );
    const taskCount = await mapLimit(tasks.data ?? [], 5, (t) => {
      const text = [t.title, t.description].filter(Boolean).join(" — ");
      return store(text, "task", t.id as string);
    });
    const journalCount = await mapLimit(journals.data ?? [], 5, (j) =>
      store(j.text as string | null, "journal", j.id as string),
    );

    return NextResponse.json({
      ok: true,
      indexed: {
        captures: captureCount,
        tasks: taskCount,
        journal: journalCount,
        total: captureCount + taskCount + journalCount,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
