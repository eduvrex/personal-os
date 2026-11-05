"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tiny client-side data layer shared by the dashboard cards.
 *
 * Cards fetch from the JSON API routes under /api, hold their own state, mutate
 * optimistically, and reconcile by re-fetching. A global "pos:refresh" event
 * lets one action (e.g. the capture bar routing an item) tell every mounted
 * card to re-pull its data.
 */

const REFRESH_EVENT = "pos:refresh";

/** Ask every mounted card to re-fetch its data. */
export function emitRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

async function parse(res: Response) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function getJSON<T>(url: string): Promise<T> {
  return fetch(url).then(parse) as Promise<T>;
}

export function sendJSON<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  return fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(parse) as Promise<T>;
}

/**
 * Fetch a JSON resource, re-fetching on mount and whenever a global refresh is
 * emitted. Returns the data plus a manual `reload` and `setData` (for optimistic
 * updates).
 */
export function useResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      const next = await getJSON<T>(url);
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    reload();
    const handler = () => reload();
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [reload]);

  return { data, loading, error, reload, setData };
}
