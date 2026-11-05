/**
 * Non-/api mirror of GET /api/assistant/nudges/external (context + GET-submit).
 * Claude's web_fetch refuses any URL containing "/api/", so the ops endpoints
 * are also served under /ops/* for header-less GET callers. Same handler, same
 * ops-token auth, same rate limits; PUT stays on the /api path.
 */
export { GET, maxDuration } from "@/app/api/assistant/nudges/external/route";
