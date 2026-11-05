"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { sendJSON, useResource } from "@/lib/api";

interface FeedDTO {
  id: string;
  name: string;
  provider: "google" | "microsoft" | "other";
  color: string;
  visible: boolean;
  last_synced_at: string | null;
  last_error: string | null;
}

const PROVIDER_LABEL: Record<FeedDTO["provider"], string> = {
  google: "Google",
  microsoft: "Microsoft",
  other: "ICS",
};

const HELP: { label: string; steps: string }[] = [
  {
    label: "Google",
    steps: "Google Calendar → Settings → your calendar → Integrate calendar → “Secret address in iCal format”.",
  },
  {
    label: "Microsoft / Outlook",
    steps: "Outlook → Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.",
  },
];

/**
 * Me-tab manager for external calendar feeds. The secret URL is write-only:
 * it is sent once on create, encrypted server-side, and never shown again.
 */
export function CalendarFeedsSection() {
  const { data: feeds, error, reload } = useResource<FeedDTO[]>("/api/calendar/feeds");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [provider, setProvider] = useState<FeedDTO["provider"]>("google");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim() || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      await sendJSON("/api/calendar/feeds", "POST", { name, url, provider });
      setName("");
      setUrl("");
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't add the feed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(feed: FeedDTO) {
    await sendJSON(`/api/calendar/feeds/${feed.id}`, "PATCH", { visible: !feed.visible });
    reload();
  }

  async function remove(feed: FeedDTO) {
    await sendJSON(`/api/calendar/feeds/${feed.id}`, "DELETE");
    reload();
  }

  return (
    <Panel title="Calendar feeds">
      <p className="text-[11px] leading-relaxed text-ink-3">
        Overlay Google and Microsoft calendars (read-only) via their secret ICS
        links. The link is stored encrypted and never shown again — treat it
        like a password.
      </p>

      {error ? <div className="mt-2"><ErrorNote message={error} onRetry={reload} /></div> : null}

      <ul className="mt-2 flex flex-col">
        {(feeds ?? []).map((feed) => (
          <li
            key={feed.id}
            className="flex items-center gap-3 border-t border-white/[0.05] py-2.5 first:border-t-0"
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: feed.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink-4">
                {feed.name}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-3">
                  {PROVIDER_LABEL[feed.provider]}
                </span>
              </div>
              <div className="truncate text-[11px] text-ink-3">
                {feed.last_error
                  ? `Last sync failed — ${feed.last_error}`
                  : feed.last_synced_at
                    ? `Synced ${new Date(feed.last_synced_at).toLocaleString()}`
                    : "Not synced yet — opens with the Calendar tab"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggle(feed)}
              className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3 underline-offset-2 hover:underline"
              aria-label={`${feed.visible ? "Hide" : "Show"} ${feed.name}`}
            >
              {feed.visible ? "Visible" : "Hidden"}
            </button>
            <button
              type="button"
              onClick={() => remove(feed)}
              className="shrink-0 text-[10px] uppercase tracking-wider text-danger/80 underline-offset-2 hover:underline"
              aria-label={`Remove ${feed.name}`}
            >
              Remove
            </button>
          </li>
        ))}
        {feeds && feeds.length === 0 ? (
          <li className="border-t border-white/[0.05] py-2.5 text-xs text-ink-3 first:border-t-0">
            No feeds yet — add your Google or Outlook calendar below.
          </li>
        ) : null}
      </ul>

      <form onSubmit={add} className="mt-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. School calendar)"
            disabled={busy}
            className="w-1/2 rounded-[3px] border border-dashed border-white/[0.08] bg-transparent px-2.5 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as FeedDTO["provider"])}
            disabled={busy}
            aria-label="Provider"
            className="w-1/2 rounded-[3px] border border-dashed border-white/[0.08] bg-transparent px-2 py-2 text-sm text-ink-4 focus:border-ember/30 focus:outline-none"
          >
            <option value="google">Google</option>
            <option value="microsoft">Microsoft / Outlook</option>
            <option value="other">Other (any ICS URL)</option>
          </select>
        </div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Secret ICS link (https:// or webcal://)"
          disabled={busy}
          className="w-full rounded-[3px] border border-dashed border-white/[0.08] bg-transparent px-2.5 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
        />
        {formError ? <div className="text-xs text-danger">{formError}</div> : null}
        <button
          type="submit"
          disabled={busy || !name.trim() || !url.trim()}
          className="self-start rounded-[3px] border border-white/[0.1] px-3 py-1.5 text-xs uppercase tracking-wider text-ink-4 disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add feed"}
        </button>
      </form>

      <div className="mt-3 flex flex-col gap-1 border-t border-white/[0.05] pt-2">
        {HELP.map((h) => (
          <p key={h.label} className="text-[11px] leading-relaxed text-ink-3">
            <span className="text-ink-4">{h.label}:</span> {h.steps}
          </p>
        ))}
      </div>
    </Panel>
  );
}
