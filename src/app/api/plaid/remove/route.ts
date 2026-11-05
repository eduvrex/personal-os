import { NextResponse, type NextRequest } from "next/server";

import { db, USER_ID } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { isUuid } from "@/lib/validate";
import { plaidClient } from "@/lib/plaid";

/**
 * Disconnect one bank login: tell Plaid to drop it (stops billing for it),
 * then delete its accounts, card rows, and transactions here. Used to clean up
 * duplicates, e.g. a second Capital One login that only has the checking account.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const itemId = typeof body?.item_id === "string" ? body.item_id : "";
  if (!isUuid(itemId)) {
    return NextResponse.json({ error: "Unknown item." }, { status: 404 });
  }

  const { data: item } = await db()
    .from("plaid_items")
    .select("id,access_token")
    .eq("user_id", USER_ID)
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Unknown item." }, { status: 404 });

  // Best-effort: if the login is already dead at Plaid, still clean up locally.
  try {
    await plaidClient().itemRemove({
      access_token: decryptSecret(item.access_token as string),
    });
  } catch {
    /* already invalid at Plaid */
  }

  const { data: accts } = await db()
    .from("finance_accounts")
    .select("id,plaid_account_id")
    .eq("user_id", USER_ID)
    .eq("plaid_item_id", itemId);
  const ids = (accts ?? []).map((a) => a.id as string);
  const plaidIds = (accts ?? [])
    .map((a) => a.plaid_account_id as string | null)
    .filter((x): x is string => !!x);

  if (ids.length) {
    await db().from("credit_cards").delete().eq("user_id", USER_ID).in("account_id", ids);
  }
  if (plaidIds.length) {
    await db()
      .from("transactions")
      .delete()
      .eq("user_id", USER_ID)
      .in("plaid_account_id", plaidIds);
  }
  // finance_accounts cascade from plaid_items.
  const { error } = await db()
    .from("plaid_items")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, accounts: ids.length });
}
