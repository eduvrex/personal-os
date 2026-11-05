import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Supabase client for server-side use only.
 *
 * Uses the service role key, which bypasses Row Level Security and has full
 * access to the database. NEVER import this from client components or expose
 * the key to the browser — the "server-only" import above will turn any such
 * import into a build error.
 *
 * Pass the `Database` generic (see {@link "@/lib/db"}) to get a fully typed
 * client: `createClient<Database>()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient<Database = any>(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
