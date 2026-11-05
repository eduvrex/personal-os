import { NextResponse, type NextRequest } from "next/server";

import { db, USER_ID } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { isUuid } from "@/lib/validate";
import {
  plaidClient,
  plaidCountryCodes,
  plaidLinkConfig,
  plaidLinkProducts,
} from "@/lib/plaid";

/**
 * Create a Plaid Link token. Two modes:
 *   - no body / no item_id  → connect a new institution
 *   - { kind: "bank"|"card" } → new connection limited to that account type
 *   - { item_id }           → update mode for an existing item: re-authenticates
 *                             a broken login AND lets you pick which accounts
 *                             to share (e.g. add cards that were left out).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemId = typeof body?.item_id === "string" ? body.item_id : null;
    const kind = body?.kind === "bank" || body?.kind === "card" ? body.kind : null;

    const client = plaidClient();

    if (itemId) {
      if (!isUuid(itemId)) {
        return NextResponse.json({ error: "Unknown item." }, { status: 404 });
      }
      const { data: item } = await db()
        .from("plaid_items")
        .select("access_token")
        .eq("user_id", USER_ID)
        .eq("id", itemId)
        .maybeSingle();
      if (!item?.access_token) {
        return NextResponse.json({ error: "Unknown item." }, { status: 404 });
      }
      // Update mode: pass the access token, omit products.
      const res = await client.linkTokenCreate({
        user: { client_user_id: USER_ID },
        client_name: "Personal OS",
        country_codes: plaidCountryCodes(),
        language: "en",
        access_token: decryptSecret(item.access_token as string),
        // Let the account picker reappear so accounts that were left out on
        // the first connect (e.g. Capital One cards) can be added.
        update: { account_selection_enabled: true },
      });
      return NextResponse.json({ link_token: res.data.link_token });
    }

    const res = await client.linkTokenCreate({
      user: { client_user_id: USER_ID },
      client_name: "Personal OS",
      ...(kind ? plaidLinkConfig(kind) : plaidLinkProducts()),
      country_codes: plaidCountryCodes(),
      language: "en",
    });
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (e) {
    return NextResponse.json(
      { error: errMsg(e) },
      { status: 500 },
    );
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const resp = (e as { response?: { data?: { error_message?: string } } }).response;
    if (resp?.data?.error_message) return resp.data.error_message;
  }
  return e instanceof Error ? e.message : "Unexpected error.";
}
