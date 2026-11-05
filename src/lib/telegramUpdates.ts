import "server-only";

import { db, USER_ID } from "@/lib/db";

/** Atomically claim a Telegram update. False means another invocation owns it. */
export async function claimTelegramUpdate(updateId: number): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await db().from("telegram_updates").insert({
    update_id: updateId,
    user_id: USER_ID,
    status: "processing",
    created_at: now,
    updated_at: now,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

export async function finishTelegramUpdate(
  updateId: number,
  input: { status: "processed" | "failed"; captureId?: string | null; error?: string | null },
): Promise<void> {
  const { error } = await db().from("telegram_updates").update({
    status: input.status,
    capture_id: input.captureId ?? null,
    error: input.error?.slice(0, 1000) ?? null,
    updated_at: new Date().toISOString(),
  }).eq("update_id", updateId).eq("user_id", USER_ID);
  if (error) throw new Error(error.message);
}

