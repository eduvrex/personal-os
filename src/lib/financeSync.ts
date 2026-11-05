import "server-only";

import type { Transaction } from "plaid";

import { db, USER_ID } from "@/lib/db";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/crypto";
import { plaidClient } from "@/lib/plaid";

export interface SyncResult {
  items: number;
  accounts: number;
  cards: number;
  transactions: number;
  removed: number;
  /** Per-item failures (institution → message). Sync continues past them. */
  errors: Record<string, string>;
}

/** Plaid error codes that mean "the user must re-authenticate this login". */
const RECONNECT_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "ITEM_LOCKED",
  "ACCESS_NOT_GRANTED",
  "INVALID_ACCESS_TOKEN",
]);

function plaidErrorCode(e: unknown): string | null {
  if (e && typeof e === "object" && "response" in e) {
    const resp = (e as { response?: { data?: { error_code?: string } } }).response;
    return resp?.data?.error_code ?? null;
  }
  return null;
}

function errText(e: unknown): string {
  return plaidErrorCode(e) ?? (e instanceof Error ? e.message : "unexpected error");
}

// ---------------------------------------------------------------------------
// Transactions cursor storage.
//
// /transactions/sync needs one cursor per item. The schema has no column for
// it, so cursors live as rows in the generic `entities` table
// (kind 'plaid_cursor', name = plaid_items.id, metadata = { cursor }) — no
// migration required, and invisible to every entities consumer (they all
// filter by their own kinds).
// ---------------------------------------------------------------------------

const CURSOR_KIND = "plaid_cursor";

async function getCursor(itemId: string): Promise<string | null> {
  const { data } = await db()
    .from("entities")
    .select("metadata")
    .eq("user_id", USER_ID)
    .eq("kind", CURSOR_KIND)
    .eq("name", itemId)
    .maybeSingle();
  const cursor = (data?.metadata as { cursor?: unknown } | null)?.cursor;
  return typeof cursor === "string" && cursor ? cursor : null;
}

async function setCursor(itemId: string, cursor: string): Promise<void> {
  const { data } = await db()
    .from("entities")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("kind", CURSOR_KIND)
    .eq("name", itemId)
    .maybeSingle();
  if (data?.id) {
    await db().from("entities").update({ metadata: { cursor } }).eq("id", data.id);
  } else {
    await db()
      .from("entities")
      .insert({ user_id: USER_ID, kind: CURSOR_KIND, name: itemId, metadata: { cursor } });
  }
}

// ---------------------------------------------------------------------------

function txnRow(t: Transaction, now: string) {
  return {
    user_id: USER_ID,
    plaid_account_id: t.account_id,
    plaid_transaction_id: t.transaction_id,
    date: t.date,
    name: t.name,
    merchant_name: t.merchant_name ?? null,
    amount: t.amount,
    category: t.personal_finance_category?.primary ?? t.category?.[0] ?? null,
    pending: t.pending,
    updated_at: now,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Cursor-based transaction sync for one item. Plaid's /transactions/sync gives
 * explicit added/modified/removed sets with stable pending→posted handling
 * (the posted txn arrives as `added`, the pending one as `removed`), so totals
 * never double-count and deletions are honoured — the two failure modes of the
 * legacy windowed /transactions/get this replaces.
 *
 * First run per item (no stored cursor) imports the full available history and
 * reconciles away any stale rows the legacy sync left behind.
 */
async function syncTransactions(
  token: string,
  itemId: string,
  accountIds: string[],
  now: string,
): Promise<{ upserted: number; removed: number }> {
  const client = plaidClient();
  const originalCursor = await getCursor(itemId);
  const initial = originalCursor == null;

  // Page through. On MUTATION_DURING_PAGINATION Plaid requires restarting from
  // the last saved cursor — retry the whole pagination once.
  let added: Transaction[] = [];
  let modified: Transaction[] = [];
  let removedIds: string[] = [];
  let cursor = originalCursor ?? undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      for (;;) {
        const res = await client.transactionsSync({
          access_token: token,
          cursor,
          count: 500,
        });
        added = added.concat(res.data.added);
        modified = modified.concat(res.data.modified);
        removedIds = removedIds.concat(
          res.data.removed.map((r) => r.transaction_id).filter((x): x is string => !!x),
        );
        cursor = res.data.next_cursor;
        if (!res.data.has_more) break;
      }
      break;
    } catch (e) {
      if (plaidErrorCode(e) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt === 0) {
        added = [];
        modified = [];
        removedIds = [];
        cursor = originalCursor ?? undefined;
        continue;
      }
      throw e;
    }
  }

  // Apply: batch upserts, then deletions, then persist the cursor (only after
  // everything applied, so a crash re-syncs rather than losing updates).
  const rows = [...added, ...modified].map((t) => txnRow(t, now));
  for (const batch of chunk(rows, 100)) {
    const { error } = await db()
      .from("transactions")
      .upsert(batch, { onConflict: "plaid_transaction_id" });
    if (error) throw new Error(error.message);
  }
  for (const batch of chunk(removedIds, 100)) {
    await db().from("transactions").delete().in("plaid_transaction_id", batch);
  }

  // Initial cursor sync: the fetched set IS the full current state for this
  // item, so purge local rows the legacy windowed sync accumulated that no
  // longer exist upstream (e.g. stale pending duplicates).
  let purged = 0;
  if (initial && accountIds.length) {
    const fetched = new Set(rows.map((r) => r.plaid_transaction_id));
    const { data: local } = await db()
      .from("transactions")
      .select("id,plaid_transaction_id")
      .eq("user_id", USER_ID)
      .in("plaid_account_id", accountIds);
    const stale = (local ?? [])
      .filter((r) => r.plaid_transaction_id && !fetched.has(r.plaid_transaction_id))
      .map((r) => r.id);
    for (const batch of chunk(stale, 100)) {
      await db().from("transactions").delete().in("id", batch);
    }
    purged = stale.length;
  }

  if (cursor) await setCursor(itemId, cursor);
  return { upserted: rows.length, removed: removedIds.length + purged };
}

/**
 * Pull fresh data from Plaid for every connected item:
 *   - balances        -> finance_accounts (upsert) + credit_cards for every
 *                        credit account (so liability-less cards still exist)
 *   - liabilities     -> credit_cards (APR, minimum payment, due date, limit)
 *   - transactions    -> transactions (cursor-based /transactions/sync)
 *
 * Access tokens stay server-side. Each item is isolated: one broken login
 * (ITEM_LOGIN_REQUIRED after a password change, etc.) is recorded on
 * plaid_items.status and reported in `errors`, and the other items still sync.
 */
export async function runSync(): Promise<SyncResult> {
  const client = plaidClient();
  const now = new Date().toISOString();

  const { data: items, error } = await db()
    .from("plaid_items")
    .select("id,access_token,institution_name")
    .eq("user_id", USER_ID);
  if (error) throw new Error(error.message);

  let accounts = 0;
  let cards = 0;
  let transactions = 0;
  let removed = 0;
  const errors: Record<string, string> = {};

  for (const item of items ?? []) {
    const label = (item.institution_name as string) || (item.id as string);
    try {
      const token = decryptSecret(item.access_token as string);
      // Self-healing: if any write path ever stores a plaintext token, encrypt it
      // on the next sync so backups never snapshot plaintext.
      if (!isEncrypted(item.access_token as string)) {
        await db()
          .from("plaid_items")
          .update({ access_token: encryptSecret(token) })
          .eq("id", item.id);
      }

      // --- Balances -> finance_accounts (+ a card row for every credit acct) ---
      const bal = await client.accountsBalanceGet({ access_token: token });
      const accountIds: string[] = [];
      for (const a of bal.data.accounts) {
        accountIds.push(a.account_id);
        const { data: acctRow } = await db()
          .from("finance_accounts")
          .upsert(
            {
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
            },
            { onConflict: "user_id,plaid_account_id" },
          )
          .select("id")
          .maybeSingle();
        accounts++;

        // Every credit account gets a credit_cards row — institutions without
        // the liabilities product (e.g. Discover) would otherwise never appear
        // in the Cards panel or count toward card debt. Merge, don't clobber:
        // curated fields survive; live balance always refreshes.
        if ((a.type ?? "") === "credit" && acctRow?.id) {
          const existing = await db()
            .from("credit_cards")
            .select("name,issuer,credit_limit,apr")
            .eq("user_id", USER_ID)
            .eq("account_id", acctRow.id)
            .maybeSingle();
          const kept = existing.data ?? null;
          await db()
            .from("credit_cards")
            .upsert(
              {
                user_id: USER_ID,
                account_id: acctRow.id,
                name: kept?.name ?? a.name ?? "Credit Card",
                issuer: kept?.issuer ?? a.official_name ?? null,
                balance: a.balances.current,
                credit_limit: a.balances.limit ?? kept?.credit_limit ?? null,
                apr: kept?.apr ?? null,
                source: "plaid",
                updated_at: now,
              },
              { onConflict: "account_id" },
            );
        }
      }

      // --- Liabilities -> credit_cards ---
      try {
        const liab = await client.liabilitiesGet({ access_token: token });
        const acctById = new Map(liab.data.accounts.map((a) => [a.account_id, a]));
        for (const cr of liab.data.liabilities?.credit ?? []) {
          if (!cr.account_id) continue;
          const a = acctById.get(cr.account_id);
          const fa = await db()
            .from("finance_accounts")
            .select("id")
            .eq("user_id", USER_ID)
            .eq("plaid_account_id", cr.account_id)
            .maybeSingle();
          if (!fa.data?.id) continue;

          const aprs = cr.aprs ?? [];
          const purchaseApr =
            aprs.find((x) => x.apr_type === "purchase_apr") ?? aprs[0];

          // Merge, don't clobber: Plaid often returns null limit/APR for these
          // institutions and generic names ("Savor"). Live numbers (balance,
          // min payment, due date) always come from Plaid; curated fields
          // (name, issuer, limit, APR) are kept unless Plaid has a real value.
          const existing = await db()
            .from("credit_cards")
            .select("name,issuer,credit_limit,apr")
            .eq("user_id", USER_ID)
            .eq("account_id", fa.data.id)
            .maybeSingle();
          const kept = existing.data ?? null;

          await db()
            .from("credit_cards")
            .upsert(
              {
                user_id: USER_ID,
                account_id: fa.data.id,
                name: kept?.name ?? a?.name ?? "Credit Card",
                issuer: kept?.issuer ?? a?.official_name ?? null,
                balance: a?.balances?.current ?? null,
                minimum_payment: cr.minimum_payment_amount ?? null,
                next_due_date: cr.next_payment_due_date ?? null,
                credit_limit: a?.balances?.limit ?? kept?.credit_limit ?? null,
                apr: purchaseApr?.apr_percentage ?? kept?.apr ?? null,
                source: "plaid",
                updated_at: now,
              },
              { onConflict: "account_id" },
            );
          cards++;
        }
      } catch {
        /* liabilities product may be unavailable for this item */
      }

      // --- Transactions (cursor sync) ---
      try {
        const t = await syncTransactions(token, item.id as string, accountIds, now);
        transactions += t.upserted;
        removed += t.removed;
      } catch (e) {
        // Transactions failing alone shouldn't mark the whole item broken
        // unless it's a re-auth error.
        const code = plaidErrorCode(e);
        if (code && RECONNECT_CODES.has(code)) throw e;
        errors[label] = `transactions: ${errText(e)}`;
      }

      await db().from("plaid_items").update({ status: "active" }).eq("id", item.id);
    } catch (e) {
      const code = plaidErrorCode(e);
      const status = code && RECONNECT_CODES.has(code) ? "login_required" : "error";
      errors[label] = errText(e);
      await db()
        .from("plaid_items")
        .update({ status })
        .eq("id", item.id)
        .then(
          () => {},
          () => {},
        );
    }
  }

  return { items: items?.length ?? 0, accounts, cards, transactions, removed, errors };
}
