"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { sendJSON, useResource } from "@/lib/api";
import type { WishlistItemDTO, WishlistResponseDTO } from "@/lib/types";
import { judgedPrice, verdictFor, type CapStatus, type Verdict } from "@/lib/wishlistMath";

const inputCls =
  "w-full rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/40 focus:outline-none";
const labelCls = "text-[10px] uppercase tracking-wider text-ink-3";
const chipBtn =
  "rounded-[2px] border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ember/40 hover:text-ember";

function usd(n: number | null | undefined, dp = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function monthName(month: string): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", { month: "long" });
}

const VERDICT: Record<Verdict["kind"], { cls: string }> = {
  fits: { cls: "border-ok/40 bg-ok/10 text-ok" },
  "next-month": { cls: "border-sun/40 bg-sun/10 text-sun" },
  save: { cls: "border-danger/40 bg-danger/10 text-danger" },
  unpriced: { cls: "border-white/10 bg-white/5 text-ink-3" },
};

function verdictText(v: Verdict): string {
  if (v.kind === "fits") return "fits this month";
  if (v.kind === "next-month") return "next month";
  if (v.kind === "save") return Number.isFinite(v.months) ? `${v.months} months of cap` : "cap is $0";
  return "add a price";
}

/**
 * Money → Wishlist. Everything he wants to buy lives here first, and the
 * monthly cap decides what's allowed: each item shows whether it fits what's
 * left this month, has to wait for next month, or needs several months of
 * cap. Either/or options share a "choice group" — buying one drops the rest.
 */
export function WishlistBoard() {
  const { data, error, reload } = useResource<WishlistResponseDTO>("/api/wishlist");
  const [showForm, setShowForm] = useState(false);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel title="Wish list"><ErrorNote message={error} onRetry={reload} /></Panel>
      </div>
    );
  }
  const items = data?.items ?? [];
  const status: CapStatus | null = data?.status ?? null;
  const wanting = items.filter((i) => i.status === "wanting");
  const history = items.filter((i) => i.status !== "wanting");

  // Group either/or options together; singles keep their own row.
  const groups = new Map<string, WishlistItemDTO[]>();
  for (const it of wanting) {
    const key = it.choice_group ? `g:${it.choice_group}` : `i:${it.id}`;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {status ? <CapPanel status={status} onChanged={reload} /> : null}

      <Panel
        title="Wanting"
        meta={
          <button type="button" onClick={() => setShowForm((s) => !s)} className={chipBtn}>
            {showForm ? "close" : "+ item"}
          </button>
        }
      >
        {showForm ? <WishForm onSaved={() => { setShowForm(false); reload(); }} /> : null}
        {!data ? (
          <EmptyState>Loading…</EmptyState>
        ) : wanting.length === 0 && !showForm ? (
          <EmptyState>Nothing on the list. Add it here before you buy it.</EmptyState>
        ) : (
          <ul className="flex flex-col">
            {[...groups.entries()].map(([key, group]) =>
              group.length > 1 ? (
                <li key={key} className="border-t border-white/[0.05] py-2 first:border-t-0">
                  <p className={`${labelCls} mb-1`}>Pick one · {group[0].choice_group}</p>
                  <ul className="flex flex-col border-l border-white/[0.08] pl-3">
                    {group.map((it) => (
                      <WishRow key={it.id} item={it} status={status} onChanged={reload} nested />
                    ))}
                  </ul>
                </li>
              ) : (
                <WishRow key={key} item={group[0]} status={status} onChanged={reload} />
              ),
            )}
          </ul>
        )}
      </Panel>

      {history.length > 0 ? (
        <Panel title="Bought & dropped">
          <ul className="flex flex-col">
            {history.map((it) => (
              <li key={it.id} className="flex items-baseline gap-3 border-t border-white/[0.05] py-1.5 text-sm first:border-t-0">
                <span className={`w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider ${it.status === "bought" ? "text-ok" : "text-ink-3"}`}>
                  {it.status}
                </span>
                <span className={`flex-1 ${it.status === "dropped" ? "text-ink-3 line-through" : "text-ink-4"}`}>
                  {it.name}{it.for_whom ? <span className="text-ink-3"> · for {it.for_whom}</span> : null}
                </span>
                <span className="font-mono text-xs text-ink-3">
                  {it.status === "bought" ? `${usd(it.bought_price, 2)} · ${it.bought_at}` : ""}
                </span>
                <button
                  type="button"
                  className={chipBtn}
                  onClick={async () => { await sendJSON(`/api/wishlist/${it.id}`, "PATCH", { status: "wanting" }); reload(); }}
                >
                  undo
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function CapPanel({ status, onChanged }: { status: CapStatus; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(status.cap));
  const pct = status.cap > 0 ? Math.min(100, (status.spent / status.cap) * 100) : 100;

  async function save() {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) {
      await sendJSON("/api/wishlist/settings", "PATCH", { monthly_cap: n });
      onChanged();
    }
    setEditing(false);
  }

  return (
    <Panel
      title={`${monthName(status.month)} cap`}
      meta={
        editing ? (
          <span className="flex items-center gap-1">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              inputMode="decimal"
              aria-label="Monthly cap"
              className="w-20 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-ink-4 focus:border-ember/30 focus:outline-none"
            />
            <button type="button" onClick={save} className={chipBtn}>save</button>
          </span>
        ) : (
          <button type="button" onClick={() => { setValue(String(status.cap)); setEditing(true); }} className={chipBtn}>
            edit cap
          </button>
        )
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-3xl text-ink-4">{usd(status.remaining)}</p>
        <p className="font-mono text-xs text-ink-3">
          left of {usd(status.cap)} · spent {usd(status.spent, 2)}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 75 ? "bg-sun" : "bg-ok"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Wish-list buys only. If it doesn&apos;t fit what&apos;s left, it waits — no borrowing from next month.
      </p>
    </Panel>
  );
}

function WishRow({
  item,
  status,
  onChanged,
  nested = false,
}: {
  item: WishlistItemDTO;
  status: CapStatus | null;
  onChanged: () => void;
  nested?: boolean;
}) {
  const [buying, setBuying] = useState(false);
  const [paid, setPaid] = useState(String(judgedPrice(item) ?? ""));
  const v = status ? verdictFor(item, status) : null;

  async function patch(body: Record<string, unknown>) {
    await sendJSON(`/api/wishlist/${item.id}`, "PATCH", body);
    onChanged();
  }

  return (
    <li className={`group flex flex-col gap-1 py-2 ${nested ? "" : "border-t border-white/[0.05] first:border-t-0"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-ink-4">
          {item.link ? (
            <a href={item.link} target="_blank" rel="noreferrer" className="hover:text-ember hover:underline">{item.name}</a>
          ) : item.name}
          {item.for_whom ? <span className="text-ink-3"> · for {item.for_whom}</span> : null}
        </span>
        <span className="font-mono text-xs text-ink-3">
          {usd(item.price)}
          {item.target_price != null && item.target_price !== item.price ? (
            <> · <span className="text-ink-4">wait for {usd(item.target_price)}</span></>
          ) : null}
        </span>
        {v ? (
          <span className={`rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${VERDICT[v.kind].cls}`}>
            {verdictText(v)}
          </span>
        ) : null}
        <span className="ml-auto flex gap-1">
          {buying ? (
            <>
              <input
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                inputMode="decimal"
                aria-label="Price paid"
                className="w-20 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-ink-4 focus:border-ember/30 focus:outline-none"
              />
              <button type="button" className={chipBtn} onClick={() => patch({ status: "bought", bought_price: paid === "" ? null : Number(paid) })}>
                confirm
              </button>
              <button type="button" className={chipBtn} onClick={() => setBuying(false)}>×</button>
            </>
          ) : (
            <>
              <button type="button" className={chipBtn} onClick={() => setBuying(true)}>bought</button>
              <button type="button" className={chipBtn} onClick={() => patch({ status: "dropped" })}>drop</button>
              <button
                type="button"
                aria-label="Delete item"
                className="px-1 text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                onClick={async () => { await sendJSON(`/api/wishlist/${item.id}`, "DELETE"); onChanged(); }}
              >
                ×
              </button>
            </>
          )}
        </span>
      </div>
      {item.notes ? <p className="text-xs leading-snug text-ink-3">{item.notes}</p> : null}
    </li>
  );
}

function WishForm({ onSaved }: { onSaved: () => void }) {
  const [f, setF] = useState({ name: "", price: "", target_price: "", for_whom: "", choice_group: "", link: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await sendJSON("/api/wishlist", "POST", {
        name: f.name,
        price: f.price || null,
        target_price: f.target_price || null,
        for_whom: f.for_whom || null,
        choice_group: f.choice_group || null,
        link: f.link || null,
        notes: f.notes || null,
      });
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-3 grid grid-cols-2 gap-2 border-b border-white/[0.05] pb-3 sm:grid-cols-4">
      <label className="col-span-2 flex flex-col gap-1 sm:col-span-4"><span className={labelCls}>What</span><input className={inputCls} value={f.name} onChange={set("name")} placeholder="e.g. AirPods Pro 3" /></label>
      <label className="flex flex-col gap-1"><span className={labelCls}>Price</span><input className={inputCls} value={f.price} onChange={set("price")} inputMode="decimal" placeholder="249" /></label>
      <label className="flex flex-col gap-1"><span className={labelCls}>Wait for</span><input className={inputCls} value={f.target_price} onChange={set("target_price")} inputMode="decimal" placeholder="190" /></label>
      <label className="flex flex-col gap-1"><span className={labelCls}>For</span><input className={inputCls} value={f.for_whom} onChange={set("for_whom")} placeholder="me" /></label>
      <label className="flex flex-col gap-1"><span className={labelCls}>Pick-one group</span><input className={inputCls} value={f.choice_group} onChange={set("choice_group")} placeholder="headphones" /></label>
      <label className="col-span-2 flex flex-col gap-1"><span className={labelCls}>Link</span><input className={inputCls} value={f.link} onChange={set("link")} placeholder="https://…" /></label>
      <label className="col-span-2 flex flex-col gap-1"><span className={labelCls}>Notes</span><input className={inputCls} value={f.notes} onChange={set("notes")} placeholder="why, what to check first" /></label>
      {err ? <p className="col-span-2 text-xs text-danger sm:col-span-4">{err}</p> : null}
      <div className="col-span-2 sm:col-span-4">
        <button type="submit" disabled={busy} className="rounded-[3px] border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50">
          {busy ? "Adding…" : "Add to wish list"}
        </button>
      </div>
    </form>
  );
}
