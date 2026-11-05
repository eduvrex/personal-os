import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in the browser / Client Components.
 *
 * Uses the public anon key, which is safe to expose to the client — access is
 * governed by Row Level Security policies on the database.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.",
    );
  }

  return createBrowserClient(url, anonKey);
}
