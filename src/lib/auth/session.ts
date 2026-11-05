/**
 * Session signing/verification for the single-password auth gate.
 *
 * Uses the Web Crypto API (HMAC-SHA256) rather than Node's `crypto`, so this
 * module works unchanged in BOTH the Edge runtime (middleware.ts) and the
 * Node runtime (route handlers). Keep it free of Node-only and `server-only`
 * imports for that reason.
 *
 * The session cookie value has the form `<base64url(payload)>.<hmacHex>`,
 * where payload is `{ v, iat }`. Tampering invalidates the HMAC; the `iat`
 * timestamp enforces a maximum session age.
 */

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

const SESSION_VERSION = 1;
const encoder = new TextEncoder();

interface SessionPayload {
  v: number;
  iat: number; // issued-at, epoch milliseconds
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET environment variable.");
  }
  return secret;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function base64urlEncode(input: string): string {
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): string {
  return atob(input.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(new Uint8Array(signature));
}

/** Constant-time string comparison (equal-length inputs only). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Compare two secrets without leaking length or content via timing: both are
 * HMAC'd (fixed-length hex output) before a constant-time comparison.
 */
export async function secretsMatch(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmacHex(a), hmacHex(b)]);
  return safeEqual(ha, hb);
}

/** Create a fresh signed session token. */
export async function createSessionToken(): Promise<string> {
  const payload: SessionPayload = { v: SESSION_VERSION, iat: Date.now() };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = await hmacHex(encoded);
  return `${encoded}.${signature}`;
}

/** Verify a session token's signature, version, and age. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return false;
  }

  const expected = await hmacHex(encoded);
  if (!safeEqual(signature, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64urlDecode(encoded)) as Partial<SessionPayload>;
    if (payload.v !== SESSION_VERSION || typeof payload.iat !== "number") {
      return false;
    }
    if (Date.now() - payload.iat > SESSION_MAX_AGE * 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify the `x-api-secret` header for programmatic access (cron, webhooks).
 * The shared secret is AUTH_SECRET.
 */
export async function verifyApiSecret(headerValue: string | null): Promise<boolean> {
  if (!headerValue) {
    return false;
  }
  return secretsMatch(headerValue, getSecret());
}
