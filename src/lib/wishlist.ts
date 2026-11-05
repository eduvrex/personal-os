import "server-only";

import { db, USER_ID } from "@/lib/db";
import { localDateKey } from "@/lib/localDate";
import { oneOf, optNum, optStr, reqStr } from "@/lib/validate";
import type { WishlistItemDTO, WishlistResponseDTO } from "@/lib/types";
import { capStatus } from "@/lib/wishlistMath";

/**
 * Wish list (Money → Wishlist): things he wants, gated by a monthly cap on
 * wish-list spending. Pure cap math lives in wishlistMath.ts (client-safe).
 */

export const DEFAULT_CAP = 75;
const STATUSES = ["wanting", "bought", "dropped"] as const;

interface Row {
  id: string;
  name: string;
  for_whom: string | null;
  price: string | number | null;
  target_price: string | number | null;
  link: string | null;
  notes: string | null;
  choice_group: string | null;
  priority: number;
  status: (typeof STATUSES)[number];
  bought_price: string | number | null;
  bought_at: string | null;
  created_at: string;
}

const num = (v: string | number | null): number | null =>
  v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;

function toDTO(r: Row): WishlistItemDTO {
  return {
    id: r.id,
    name: r.name,
    for_whom: r.for_whom,
    price: num(r.price),
    target_price: num(r.target_price),
    link: r.link,
    notes: r.notes,
    choice_group: r.choice_group,
    priority: r.priority,
    status: r.status,
    bought_price: num(r.bought_price),
    bought_at: r.bought_at,
    created_at: r.created_at,
  };
}

export async function getCap(): Promise<number> {
  const { data } = await db()
    .from("wishlist_settings")
    .select("monthly_cap")
    .eq("user_id", USER_ID)
    .maybeSingle();
  return data ? Number(data.monthly_cap) : DEFAULT_CAP;
}

export async function setCap(cap: number): Promise<number> {
  const { error } = await db()
    .from("wishlist_settings")
    .upsert({ user_id: USER_ID, monthly_cap: cap, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return cap;
}

export async function getWishlist(): Promise<WishlistResponseDTO> {
  const [{ data, error }, cap] = await Promise.all([
    db()
      .from("wishlist_items")
      .select("*")
      .eq("user_id", USER_ID)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true }),
    getCap(),
  ]);
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as Row[]).map(toDTO);
  const month = localDateKey().slice(0, 7);
  return { items, status: capStatus(items, cap, month) };
}

export interface WishInput {
  name: string;
  for_whom: string | null;
  price: number | null;
  target_price: number | null;
  link: string | null;
  notes: string | null;
  choice_group: string | null;
  priority: number;
}

export function parseWishBody(body: Record<string, unknown>): WishInput {
  const link = optStr(body.link, "link", 1000);
  if (link && !/^https?:\/\//i.test(link)) throw new Error("link must start with http(s)://");
  return {
    name: reqStr(body.name, "name", 200),
    for_whom: optStr(body.for_whom, "for_whom", 80),
    price: optNum(body.price, "price", 0, 100_000),
    target_price: optNum(body.target_price, "target_price", 0, 100_000),
    link,
    notes: optStr(body.notes, "notes", 2000),
    choice_group: optStr(body.choice_group, "choice_group", 80)?.toLowerCase() ?? null,
    priority: optNum(body.priority, "priority", 1, 3) ?? 2,
  };
}

export async function createWish(input: WishInput): Promise<WishlistItemDTO> {
  const { data, error } = await db()
    .from("wishlist_items")
    .insert({ user_id: USER_ID, ...input })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data as Row);
}

export interface WishPatch extends Partial<WishInput> {
  status?: (typeof STATUSES)[number];
  bought_price?: number | null;
}

export function parseWishPatch(body: Record<string, unknown>): WishPatch {
  const patch: WishPatch = {};
  if ("name" in body) patch.name = reqStr(body.name, "name", 200);
  if ("for_whom" in body) patch.for_whom = optStr(body.for_whom, "for_whom", 80);
  if ("price" in body) patch.price = optNum(body.price, "price", 0, 100_000);
  if ("target_price" in body) patch.target_price = optNum(body.target_price, "target_price", 0, 100_000);
  if ("notes" in body) patch.notes = optStr(body.notes, "notes", 2000);
  if ("priority" in body) patch.priority = optNum(body.priority, "priority", 1, 3) ?? 2;
  if ("status" in body) patch.status = oneOf(body.status, "status", STATUSES) as WishPatch["status"];
  if ("bought_price" in body) patch.bought_price = optNum(body.bought_price, "bought_price", 0, 100_000);
  return patch;
}

/**
 * Update an item. Marking it bought stamps today's date (and the price paid,
 * defaulting to the list price) and drops the other options in its
 * choice_group — you picked one. Moving it back to "wanting" clears both.
 */
export async function updateWish(id: string, patch: WishPatch): Promise<WishlistItemDTO | null> {
  const upd: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.status === "bought") {
    upd.bought_at = localDateKey();
    if (patch.bought_price == null) {
      const { data: cur } = await db()
        .from("wishlist_items")
        .select("price")
        .eq("user_id", USER_ID)
        .eq("id", id)
        .maybeSingle();
      upd.bought_price = cur?.price ?? null;
    }
  } else if (patch.status) {
    upd.bought_at = null;
    upd.bought_price = null;
  }
  const { data, error } = await db()
    .from("wishlist_items")
    .update(upd)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const item = toDTO(data as Row);
  if (patch.status === "bought" && item.choice_group) {
    await db()
      .from("wishlist_items")
      .update({ status: "dropped", updated_at: new Date().toISOString() })
      .eq("user_id", USER_ID)
      .eq("choice_group", item.choice_group)
      .eq("status", "wanting")
      .neq("id", id);
  }
  return item;
}

export async function deleteWish(id: string): Promise<void> {
  const { error } = await db().from("wishlist_items").delete().eq("user_id", USER_ID).eq("id", id);
  if (error) throw new Error(error.message);
}
