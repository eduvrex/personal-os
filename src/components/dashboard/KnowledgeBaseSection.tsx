"use client";

import { useMemo, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { sendJSON, useResource } from "@/lib/api";
import type { KnowledgeItemDTO, KnowledgeTier } from "@/lib/types";

const inputCls =
  "w-full rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/40 focus:outline-none";
const labelCls = "text-[10px] uppercase tracking-wider text-ink-3";

/**
 * Me-tab editor for the assistant's knowledge base. The assistant reads this
 * before answering. Each
 * item has a privacy tier: PUBLIC items can appear anywhere; PRIVATE items are
 * advisor-only — never on Home, in a résumé/CV, in public nudges, or in exports.
 */
export function KnowledgeBaseSection() {
  const { data, reload } = useResource<KnowledgeItemDTO[]>("/api/knowledge");
  const [showForm, setShowForm] = useState(false);
  const items = useMemo(() => data ?? [], [data]);

  const bySection = useMemo(() => {
    const map = new Map<string, KnowledgeItemDTO[]>();
    for (const it of items) map.set(it.section, [...(map.get(it.section) ?? []), it]);
    return [...map.entries()];
  }, [items]);

  const knownSections = useMemo(
    () => [...new Set(items.map((i) => i.section))],
    [items],
  );
  const privateCount = items.filter((i) => i.tier === "private").length;

  return (
    <Panel
      title="Knowledge Base"
      meta={
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-[2px] border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ember/40 hover:text-ember"
        >
          {showForm ? "close" : "+ item"}
        </button>
      }
    >
      <p className="-mt-1 mb-3 text-xs text-ink-3">
        What the assistant reads before answering.{" "}
        <span className="text-ink-4">Public</span> items can appear anywhere;{" "}
        <span className="text-ember">PRIVATE</span> items are advisor-only — never on Home,
        in a résumé, in public nudges, or in exports.
        {privateCount > 0 ? ` (${privateCount} private)` : ""}
      </p>

      {showForm ? (
        <ItemForm
          knownSections={knownSections}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      ) : null}

      {items.length === 0 && !showForm ? (
        <EmptyState>Empty — add what the assistant should know about you.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {bySection.map(([section, secItems]) => (
            <div key={section}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                {section}
              </div>
              <ul className="flex flex-col gap-2">
                {secItems.map((it) => (
                  <ItemRow key={it.id} item={it} onChanged={reload} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ItemRow({ item, onChanged }: { item: KnowledgeItemDTO; onChanged: () => void }) {
  const [content, setContent] = useState(item.content);
  const isPrivate = item.tier === "private";

  async function patch(body: Record<string, unknown>) {
    await sendJSON(`/api/knowledge/${item.id}`, "PATCH", body);
    onChanged();
  }

  return (
    <li
      className={`rounded-[3px] border bg-white/[0.02] p-2.5 ${
        isPrivate ? "border-ember/25" : "border-white/[0.06]"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => patch({ tier: isPrivate ? "public" : "private" })}
          title="Toggle privacy tier"
          className={`rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
            isPrivate
              ? "border-ember/40 bg-ember/10 text-ember"
              : "border-white/10 bg-white/5 text-ink-3 hover:border-ember/30"
          }`}
        >
          {isPrivate ? "🔒 private · advisor-only" : "public"}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={async () => {
            await sendJSON(`/api/knowledge/${item.id}`, "DELETE");
            onChanged();
          }}
          aria-label="Delete item"
          className="text-ink-3 transition-colors hover:text-danger"
        >
          ×
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => {
          if (content.trim() && content !== item.content) patch({ content });
        }}
        rows={Math.min(8, Math.max(2, content.split("\n").length))}
        className="w-full resize-y rounded-[3px] border border-transparent bg-transparent px-1 py-1 text-sm leading-relaxed text-ink-4 hover:border-white/[0.08] focus:border-ember/30 focus:outline-none"
        aria-label={`${item.section} content`}
      />
    </li>
  );
}

function ItemForm({
  knownSections,
  onSaved,
}: {
  knownSections: string[];
  onSaved: () => void;
}) {
  const [section, setSection] = useState("");
  const [content, setContent] = useState("");
  const [tier, setTier] = useState<KnowledgeTier>("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !section.trim() || !content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendJSON("/api/knowledge", "POST", { section, content, tier });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-3 flex flex-col gap-2 rounded-[3px] border border-dashed border-white/[0.08] p-3">
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[10rem] flex-1">
          <div className={labelCls}>Section</div>
          <input
            className={inputCls}
            value={section}
            onChange={(e) => setSection(e.target.value)}
            list="kb-sections"
            placeholder="e.g. Goals & timeline"
            required
          />
          <datalist id="kb-sections">
            {knownSections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="w-40">
          <div className={labelCls}>Tier</div>
          <select
            className={inputCls}
            value={tier}
            onChange={(e) => setTier(e.target.value as KnowledgeTier)}
          >
            <option value="public">public</option>
            <option value="private">private · advisor-only</option>
          </select>
        </div>
      </div>
      <div>
        <div className={labelCls}>Content</div>
        <textarea
          className={`${inputCls} resize-y`}
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="A fact, note, or preference the assistant should know…"
          required
        />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !section.trim() || !content.trim()}
        className="self-start rounded-[3px] border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Add to knowledge base"}
      </button>
    </form>
  );
}
