import "server-only";

import { db, USER_ID } from "@/lib/db";
import type { KeyDate, ProfileDTO } from "@/lib/types";

const EMPTY: ProfileDTO = {
  current_city: null,
  target_city: null,
  target_date: null,
  occupation: null,
  studies: null,
  languages: [],
  residency_status: null,
  about: null,
  key_dates: [],
  facts: {},
};

function toDTO(row: Record<string, unknown> | null): ProfileDTO {
  if (!row) return EMPTY;
  return {
    current_city: (row.current_city as string) ?? null,
    target_city: (row.target_city as string) ?? null,
    target_date: (row.target_date as string) ?? null,
    occupation: (row.occupation as string) ?? null,
    studies: (row.studies as string) ?? null,
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
    residency_status: (row.residency_status as string) ?? null,
    about: (row.about as string) ?? null,
    key_dates: Array.isArray(row.key_dates) ? (row.key_dates as KeyDate[]) : [],
    facts: (row.facts as Record<string, unknown>) ?? {},
  };
}

export async function getProfile(): Promise<ProfileDTO> {
  const { data, error } = await db()
    .from("profile")
    .select("*")
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return toDTO(data);
}

const FIELDS = new Set([
  "current_city",
  "target_city",
  "target_date",
  "occupation",
  "studies",
  "languages",
  "residency_status",
  "about",
  "key_dates",
  "facts",
]);

export async function updateProfile(
  patch: Record<string, unknown>,
): Promise<ProfileDTO> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    if (FIELDS.has(k)) update[k] = v;
  }
  const { data, error } = await db()
    .from("profile")
    .upsert({ user_id: USER_ID, ...update }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data);
}
