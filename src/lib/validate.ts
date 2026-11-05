/**
 * Small input-validation helpers for API route bodies.
 *
 * Philosophy: reject absurd payloads (multi-MB strings, wrong shapes) with a
 * 400 before they reach the DB or an LLM; clamp/normalize everything else.
 * Client-safe (no server imports) so tests can exercise it directly.
 */

export class ValidationError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** The request body must be a plain object. */
export function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

/** Required trimmed string with a length cap. */
export function reqStr(v: unknown, field: string, max: number): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new ValidationError(`${field} is required.`);
  }
  const s = v.trim();
  if (s.length > max) throw new ValidationError(`${field} exceeds ${max} characters.`);
  return s;
}

/** Optional string (null/undefined/"" → null), trimmed, capped. */
export function optStr(v: unknown, field: string, max: number): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw new ValidationError(`${field} must be a string.`);
  const s = v.trim();
  if (s.length > max) throw new ValidationError(`${field} exceeds ${max} characters.`);
  return s || null;
}

/** Value must be one of the allowed literals (or null when optional=true). */
export function oneOf<T extends string>(
  v: unknown,
  field: string,
  allowed: readonly T[],
  optional = false,
): T | null {
  if (v == null && optional) return null;
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}.`);
}

/** Optional finite number within [min, max]. */
export function optNum(
  v: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new ValidationError(`${field} must be a number.`);
  }
  if (n < min || n > max) throw new ValidationError(`${field} out of range.`);
  return n;
}

/** UUID path/route parameter. */
export function reqUuid(v: unknown, field = "id"): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) {
    throw new ValidationError(`${field} must be a UUID.`);
  }
  return v;
}

export function isUuid(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Optional YYYY-MM-DD date key (also accepts a leading date in an ISO string). */
export function optDateKey(v: unknown, field: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw new ValidationError(`${field} must be a date string.`);
  const key = v.slice(0, 10);
  if (!DATE_KEY_RE.test(key) || Number.isNaN(Date.parse(`${key}T00:00:00Z`))) {
    throw new ValidationError(`${field} must be YYYY-MM-DD.`);
  }
  return key;
}

/** Optional ISO datetime (or date key); returns the original string. */
export function optIsoDate(v: unknown, field: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || v.length > 40 || Number.isNaN(Date.parse(v))) {
    throw new ValidationError(`${field} must be a valid date/datetime.`);
  }
  return v;
}

/** Optional #rrggbb color. */
export function optHexColor(v: unknown, field: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
    throw new ValidationError(`${field} must be a #rrggbb color.`);
  }
  return v;
}

/** Array of short strings (tags, languages), deduped and capped. */
export function strArray(
  v: unknown,
  field: string,
  maxItems: number,
  maxLen: number,
): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be an array.`);
  if (v.length > maxItems) throw new ValidationError(`${field} exceeds ${maxItems} items.`);
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") throw new ValidationError(`${field} items must be strings.`);
    const s = item.trim().slice(0, maxLen);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Array of { label, done } milestones / goal items. */
export function milestoneArray(
  v: unknown,
  field: string,
  maxItems = 200,
): { label: string; done: boolean }[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be an array.`);
  if (v.length > maxItems) throw new ValidationError(`${field} exceeds ${maxItems} items.`);
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => {
      const m: { label: string; done: boolean; date?: string } = {
        label: String((x.label ?? x.text) ?? "").trim().slice(0, 500),
        done: Boolean(x.done),
      };
      if (typeof x.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(x.date)) {
        m.date = x.date.slice(0, 10);
      }
      return m;
    })
    .filter((x) => x.label.length > 0);
}

/** Array of { label, date } key dates. */
export function keyDateArray(v: unknown, field: string): { label: string; date: string }[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be an array.`);
  if (v.length > 100) throw new ValidationError(`${field} exceeds 100 items.`);
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      label: String(x.label ?? "").trim().slice(0, 300),
      date: typeof x.date === "string" && DATE_KEY_RE.test(x.date.slice(0, 10)) ? x.date.slice(0, 10) : "",
    }))
    .filter((x) => x.label.length > 0 || x.date.length > 0);
}
