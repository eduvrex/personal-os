import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Re-exported so transcription can build upload payloads without its own SDK
// import (the guardrail test allows the SDKs in this file only).
export { toFile } from "openai";

/**
 * THE ONLY MODULE THAT MAY IMPORT AN LLM SDK.
 *
 * Every AI surface (classifier, nudges, ask, support, drafts, advisor,
 * tailor, transcription) builds its client and parses model output through
 * these helpers, so timeouts, retry policy, model-tier selection, and
 * JSON-extraction robustness are decided in exactly one reviewed place.
 * `tests/unit/llmGuardrail.test.ts` pins both directions: no other file may
 * import the SDKs, and the set of files importing this module is an explicit
 * allowlist.
 */

/** Frequent/cheap tier — classifier, nudges, ask, support, drafts. */
export function lightModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
}

/** Occasional/paid tier — advisor answers, CV tailoring. */
export function heavyModel(): string {
  return process.env.ANTHROPIC_MODEL_HEAVY || "claude-sonnet-5";
}

export interface ClientOptions {
  /** Hard wall-clock limit per attempt. Default 60s — always below the route's maxDuration. */
  timeoutMs?: number;
  /** SDK-level retries on 5xx/timeouts. Default 1 (a second paid attempt, never a storm). */
  maxRetries?: number;
}

/**
 * Anthropic client with an explicit timeout. The SDK default is 10 minutes —
 * longer than any Vercel function is allowed to live, which turns a hung call
 * into an opaque platform kill instead of a catchable error.
 */
export function anthropicClient(opts: ClientOptions = {}): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({
    apiKey,
    timeout: opts.timeoutMs ?? 60_000,
    maxRetries: opts.maxRetries ?? 1,
  });
}

/** OpenAI client (classifier fallback + Whisper transcription). */
export function openaiClient(opts: ClientOptions = {}): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    timeout: opts.timeoutMs ?? 60_000,
    maxRetries: opts.maxRetries ?? 1,
  });
}

/**
 * Join every text block of a response. Safe with extended thinking enabled:
 * thinking blocks are type "thinking" and are skipped, so callers never see
 * (or store) chain-of-thought by accident.
 */
export function textFrom(res: Anthropic.Message): string {
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("")
    .trim();
}

/**
 * Tolerant JSON extraction from model text. Handles bare JSON, ```json fences,
 * and prose-wrapped replies ("Here are your nudges: [...]"). Returns null for
 * anything unparseable (including truncated output) — callers decide whether
 * null is an error or a fallback.
 */
export function extractJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  const stripped = raw.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    /* fall through to bracket slicing */
  }
  const start = stripped.search(/[[{]/);
  if (start === -1) return null;
  const open = stripped[start];
  const close = open === "[" ? "]" : "}";
  const end = stripped.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}
