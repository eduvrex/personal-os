import "server-only";

import {
  Configuration,
  CreditAccountSubtype,
  DepositoryAccountSubtype,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type CountryCode,
  type LinkTokenAccountFilters,
} from "plaid";

/**
 * Server-only Plaid client. Access tokens and secrets never leave the server.
 */
export function plaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const env = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;
  // Use the secret matching the active environment.
  const secret =
    env === "production"
      ? process.env.PLAID_PRODUCTION_SECRET
      : process.env.PLAID_SANDBOX_SECRET;
  if (!clientId || !secret) {
    throw new Error(`Plaid is not configured (PLAID_CLIENT_ID / ${env} secret).`);
  }
  const config = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  return new PlaidApi(config);
}

export function plaidProducts(): Products[] {
  return (process.env.PLAID_PRODUCTS || "transactions,liabilities")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Products[];
}

/**
 * Products for a NEW Link session. Plaid hides/rejects any bank that can't do
 * every product in `products` ("Connectivity not supported"), and Liabilities
 * only exists for credit cards/loans — so a checking-only bank (Chime,
 * Elevations, Huntington) could never be linked while Liabilities was required.
 * Only Transactions is required; everything else from PLAID_PRODUCTS is
 * "required if supported": pulled when the bank has it, never blocks one that doesn't.
 */
export function plaidLinkProducts(): {
  products: Products[];
  required_if_supported_products: Products[];
} {
  const all = plaidProducts();
  const products = all.includes(Products.Transactions)
    ? [Products.Transactions]
    : all.slice(0, 1);
  return {
    products,
    required_if_supported_products: all.filter((p) => !products.includes(p)),
  };
}

export type LinkKind = "bank" | "card";

/**
 * Link config for the two connect buttons. Splitting them matters for banks
 * like Capital One that hold BOTH a checking account and cards under one login:
 *   - "bank": Transactions only, and Link shows only checking/savings accounts.
 *   - "card": Transactions + Liabilities required, and Link shows only credit
 *     cards — so the cards can't silently get left out, and Plaid errors out
 *     (instead of connecting an empty login) if no card is shared.
 */
export function plaidLinkConfig(kind: LinkKind): {
  products: Products[];
  required_if_supported_products?: Products[];
  account_filters: LinkTokenAccountFilters;
} {
  if (kind === "card") {
    return {
      products: [Products.Transactions, Products.Liabilities],
      account_filters: {
        credit: { account_subtypes: [CreditAccountSubtype.CreditCard] },
      },
    };
  }
  return {
    products: [Products.Transactions],
    account_filters: {
      depository: { account_subtypes: [DepositoryAccountSubtype.All] },
    },
  };
}

export function plaidCountryCodes(): CountryCode[] {
  return (process.env.PLAID_COUNTRY_CODES || "US")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as CountryCode[];
}
