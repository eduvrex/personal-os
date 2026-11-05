import "server-only";

import { db, USER_ID } from "@/lib/db";
import type { ResumeDTO } from "@/lib/types";

export async function getResume(): Promise<ResumeDTO> {
  const { data, error } = await db()
    .from("resume")
    .select("*")
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    full_text: (data?.full_text as string) ?? null,
    structured: (data?.structured as Record<string, unknown>) ?? {},
    updated_at: (data?.updated_at as string) ?? null,
  };
}

export async function updateResume(fullText: string): Promise<ResumeDTO> {
  const { data, error } = await db()
    .from("resume")
    .upsert(
      { user_id: USER_ID, full_text: fullText, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    full_text: (data.full_text as string) ?? null,
    structured: (data.structured as Record<string, unknown>) ?? {},
    updated_at: (data.updated_at as string) ?? null,
  };
}
