/**
 * Non-/api mirror of GET /api/admin/capture-audit (see that route for the
 * privacy posture — personal content redacted/excluded). Exists because
 * web_fetch-class callers refuse "/api/" URLs.
 */
export { GET, maxDuration } from "@/app/api/admin/capture-audit/route";
