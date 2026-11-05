import { NextResponse, type NextRequest } from "next/server";

import { db, USER_ID } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { plaidClient, plaidCountryCodes } from "@/lib/plaid";

/**
 * Exchange a public_token for an access_token, store the item (access token
 * SERVER-SIDE ONLY), and seed finance_accounts.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const publicToken = String(body?.public_token ?? "");
  if (!publicToken) {
    return NextResponse.json({ error: "public_token is required." }, { status: 400 });
  }

  try {
    const client = plaidClient();
    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const accountsRes = await client.accountsGet({ access_token: accessToken });
    const institutionId = accountsRes.data.item.institution_id;

    let institutionName: string | null = null;
    if (institutionId) {
      try {
        const inst = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: plaidCountryCodes(),
        });
        institutionName = inst.data.institution.name;
      } catch {
        /* institution lookup is best-effort */
      }
    }

    const now = new Date().toISOString();
    const { data: item, error: itemErr } = await db()
      .from("plaid_items")
      .insert({
        user_id: USER_ID,
        item_id: itemId,
        // Encrypted at rest; decrypted only inside the server sync job.
        access_token: encryptSecret(accessToken),
        institution_name: institutionName,
        status: "active",
        created_at: now,
      })
      .select("id")
      .single();
    if (itemErr) throw new Error(itemErr.message);

    const rows = accountsRes.data.accounts.map((a) => ({
      user_id: USER_ID,
      plaid_item_id: item.id,
      plaid_account_id: a.account_id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      mask: a.mask,
      current_balance: a.balances.current,
      available_balance: a.balances.available,
      credit_limit: a.balances.limit,
      source: "plaid",
      updated_at: now,
    }));
    const { error: accErr } = await db()
      .from("finance_accounts")
      .upsert(rows, { onConflict: "user_id,plaid_account_id" });
    if (accErr) throw new Error(accErr.message);

    return NextResponse.json({
      ok: true,
      institution: institutionName,
      accounts: rows.length,
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const resp = (e as { response?: { data?: { error_message?: string } } }).response;
    if (resp?.data?.error_message) return resp.data.error_message;
  }
  return e instanceof Error ? e.message : "Unexpected error.";
}
