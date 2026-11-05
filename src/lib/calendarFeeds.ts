import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db, USER_ID } from "@/lib/db";
import { ValidationError } from "@/lib/validate";

/**
 * Multi-provider calendar feeds (Google, Microsoft/Outlook, any ICS URL).
 *
 * Both providers publish read-only "secret address" ICS URLs:
 *   Google:    Settings → [calendar] → "Secret address in iCal format"
 *   Microsoft: Outlook settings → Calendar → Shared calendars → Publish → ICS
 *
 * Those are capability URLs — the link IS the credential — so they are
 * encrypted at rest (same app key as Plaid tokens) and NEVER included in a
 * DTO, API response, or export. Each feed becomes its own toggleable calendar
 * category; fetch failures are isolated per feed and surfaced as `last_error`
 * instead of breaking the merged calendar.
 */

export type FeedProvider = "google" | "microsoft" | "other";

export interface CalendarFeedDTO {
  id: string;
  name: string;
  provider: FeedProvider;
  color: string;
  visible: boolean;
  last_synced_at: string | null;
  last_error: string | null;
}

export const FEED_PROVIDERS: FeedProvider[] = ["google", "microsoft", "other"];

/** Muted hues in the existing category palette, per provider. */
export const PROVIDER_COLORS: Record<FeedProvider, string> = {
  google: "#8c9a82",
  microsoft: "#7f93a8",
  other: "#a79e8c",
};

const URL_MAX = 2000;

/**
 * Validate + normalize a feed URL. Accepts https:// and webcal:// (Outlook's
 * publish UI offers webcal; it is https underneath). Pure; exported for tests.
 */
export function normalizeFeedUrl(raw: string): string {
  const url = raw.trim();
  if (!url) throw new ValidationError("url is required.");
  if (url.length > URL_MAX) throw new ValidationError("url is too long.");
  const normalized = url.replace(/^webcal:\/\//i, "https://");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ValidationError("url must be a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new ValidationError("url must be https:// (or webcal://).");
  }
  return parsed.toString();
}

/** DTO mapper — deliberately never touches url_encrypted. Exported for tests. */
export function toFeedDTO(row: Record<string, unknown>): CalendarFeedDTO {
  const provider = FEED_PROVIDERS.find((p) => p === row.provider) ?? "other";
  return {
    id: String(row.id),
    name: String(row.name),
    provider,
    color: (row.color as string) || PROVIDER_COLORS[provider],
    visible: row.visible !== false,
    last_synced_at: (row.last_synced_at as string) ?? null,
    last_error: (row.last_error as string) ?? null,
  };
}

export async function listFeeds(): Promise<CalendarFeedDTO[]> {
  const { data, error } = await db()
    .from("calendar_feeds")
    .select("id,name,provider,color,visible,last_synced_at,last_error")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });
  // Resilient pre-migration: an absent table just means no feeds yet.
  if (error) return [];
  return (data ?? []).map((r) => toFeedDTO(r as Record<string, unknown>));
}

export async function createFeed(input: {
  name: string;
  url: string;
  provider?: string | null;
  color?: string | null;
}): Promise<CalendarFeedDTO> {
  const provider = FEED_PROVIDERS.find((p) => p === input.provider) ?? "other";
  const url = normalizeFeedUrl(input.url);
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("calendar_feeds")
    .insert({
      user_id: USER_ID,
      name: input.name.trim(),
      provider,
      url_encrypted: encryptSecret(url),
      color: input.color ?? PROVIDER_COLORS[provider],
      visible: true,
      created_at: now,
      updated_at: now,
    })
    .select("id,name,provider,color,visible,last_synced_at,last_error")
    .single();
  if (error) throw new Error(error.message);
  return toFeedDTO(data as Record<string, unknown>);
}

export async function updateFeed(
  id: string,
  input: { name?: string; color?: string | null; visible?: boolean; url?: string },
): Promise<CalendarFeedDTO | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.name === "string" && input.name.trim()) patch.name = input.name.trim();
  if ("color" in input) patch.color = input.color ?? null;
  if (typeof input.visible === "boolean") patch.visible = input.visible;
  if (typeof input.url === "string") {
    patch.url_encrypted = encryptSecret(normalizeFeedUrl(input.url));
    patch.last_error = null;
  }
  const { data, error } = await db()
    .from("calendar_feeds")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("id,name,provider,color,visible,last_synced_at,last_error")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toFeedDTO(data as Record<string, unknown>) : null;
}

export async function deleteFeed(id: string): Promise<void> {
  const { error } = await db()
    .from("calendar_feeds")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Fetching (per-feed 5-minute cache, per-feed fault isolation)
// ---------------------------------------------------------------------------

const FEED_TTL_MS = 5 * 60 * 1000;
const feedCache = new Map<string, { at: number; text: string }>();

async function fetchFeedText(id: string, url: string): Promise<string | null> {
  const cached = feedCache.get(id);
  if (cached && Date.now() - cached.at < FEED_TTL_MS) return cached.text;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`feed responded ${res.status}`);
  const text = await res.text();
  feedCache.set(id, { at: Date.now(), text });
  return text;
}

export interface FeedWithText {
  feed: CalendarFeedDTO;
  text: string | null;
}

/**
 * Fetch every VISIBLE feed's ICS text. A failing feed stamps last_error and
 * yields text=null (stale cache is used when present); others are unaffected.
 */
export async function visibleFeedTexts(): Promise<FeedWithText[]> {
  const { data, error } = await db()
    .from("calendar_feeds")
    .select("id,name,provider,color,visible,last_synced_at,last_error,url_encrypted")
    .eq("user_id", USER_ID)
    .eq("visible", true)
    .order("created_at", { ascending: true });
  if (error) return [];

  return Promise.all(
    (data ?? []).map(async (row) => {
      const feed = toFeedDTO(row as Record<string, unknown>);
      try {
        const url = decryptSecret(String(row.url_encrypted));
        const text = await fetchFeedText(feed.id, url);
        await db()
          .from("calendar_feeds")
          .update({ last_synced_at: new Date().toISOString(), last_error: null })
          .eq("user_id", USER_ID)
          .eq("id", feed.id);
        return { feed, text };
      } catch (e) {
        await db()
          .from("calendar_feeds")
          .update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "fetch failed" })
          .eq("user_id", USER_ID)
          .eq("id", feed.id);
        const stale = feedCache.get(feed.id);
        return { feed, text: stale?.text ?? null };
      }
    }),
  );
}
