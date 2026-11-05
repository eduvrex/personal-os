/**
 * Finance debt lock — a PRIVACY SCREEN, not encryption.
 *
 * Debt detail (cards, balances, APRs, utilization, loan totals) is redacted
 * from API responses until the operator enters FINANCE_PIN. Unlocking sets a
 * short-lived signed cookie (browser-session only, 30-minute hard expiry), so
 * a shoulder-surfer or borrowed laptop shows assets — never the debt. The data
 * itself stays protected server-side by the normal auth gate either way.
 *
 * Web Crypto only (mirrors lib/auth/session.ts) so it runs in any runtime.
 */

export const DEBT_COOKIE = "debt_unlock";
/** Unlock lifetime in seconds — re-locks after this even mid-session. */
export const DEBT_UNLOCK_MAX_AGE = 30 * 60;

const VERSION = 1;
const SCOPE = "debt";
const encoder = new TextEncoder();

interface UnlockPayload {
  v: number;
  scope: string;
  iat: number;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing AUTH_SECRET environment variable.");
  return secret;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(new Uint8Array(sig));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function createUnlockToken(): Promise<string> {
  const payload: UnlockPayload = { v: VERSION, scope: SCOPE, iat: Date.now() };
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${encoded}.${await hmacHex(encoded)}`;
}

export async function verifyUnlockToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  if (!safeEqual(signature, await hmacHex(encoded))) return false;
  try {
    const payload = JSON.parse(
      atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
    ) as Partial<UnlockPayload>;
    if (payload.v !== VERSION || payload.scope !== SCOPE) return false;
    if (typeof payload.iat !== "number") return false;
    return Date.now() - payload.iat <= DEBT_UNLOCK_MAX_AGE * 1000;
  } catch {
    return false;
  }
}
