import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * At-rest encryption for stored secrets (Plaid access tokens).
 *
 * AES-256-GCM with a 32-byte key from PLAID_TOKEN_ENC_KEY (hex). Ciphertext is
 * stored as `enc:v1:<iv>:<tag>:<ct>` (base64url parts) in the same text column,
 * so no schema change is needed and legacy plaintext rows remain readable until
 * re-encrypted.
 */

const PREFIX = "enc:v1:";

function key(): Buffer {
  const hex = process.env.PLAID_TOKEN_ENC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("PLAID_TOKEN_ENC_KEY must be set (32-byte hex).");
  }
  return Buffer.from(hex, "hex");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64 = (b: Buffer) => b.toString("base64url");
  return `${PREFIX}${b64(iv)}:${b64(tag)}:${b64(ct)}`;
}

/** Decrypts `enc:v1:` values; passes legacy plaintext through unchanged. */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":");
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted secret.");
  const tagBuf = Buffer.from(tag, "base64url");
  if (tagBuf.length !== 16) throw new Error("Malformed auth tag.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(tagBuf);
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
