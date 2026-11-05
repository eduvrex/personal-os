"use client";

import { useEffect, useRef, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { sendJSON, useResource } from "@/lib/api";
import type { KeyDate, ProfileDTO } from "@/lib/types";

const inputBase =
  "rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none";
const inputCls = `w-full ${inputBase}`;

export function ProfileSection() {
  const { data } = useResource<ProfileDTO>("/api/profile");
  const [p, setP] = useState<ProfileDTO | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data && !p) setP(data);
  }, [data, p]);

  function flash() {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1500);
  }

  async function save(partial: Partial<ProfileDTO>) {
    try {
      await sendJSON("/api/profile", "PATCH", partial);
      setSaveError(null);
      flash();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed — edit again to retry.");
    }
  }

  function set<K extends keyof ProfileDTO>(key: K, value: ProfileDTO[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (!p) {
    return (
      <Panel title="Me">
        <div className="text-sm text-ink-3">Loading…</div>
      </Panel>
    );
  }

  const langStr = p.languages.join(", ");

  return (
    <Panel
      title="Profile"
      meta={
        saved ? (
          <span className="text-ember">saved ✓</span>
        ) : saveError ? (
          <span className="text-danger">not saved</span>
        ) : (
          <span>your context</span>
        )
      }
    >
      {saveError ? (
        <div className="mb-3 rounded-[3px] border border-danger/20 bg-danger/[0.06] px-3 py-2 text-xs text-danger">
          {saveError}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Current city">
          <input
            className={inputCls}
            value={p.current_city ?? ""}
            placeholder="Where you are now"
            onChange={(e) => set("current_city", e.target.value)}
            onBlur={() => save({ current_city: p.current_city })}
          />
        </Field>
        <Field label="Target city">
          <input
            className={inputCls}
            value={p.target_city ?? ""}
            placeholder="Where you're headed"
            onChange={(e) => set("target_city", e.target.value)}
            onBlur={() => save({ target_city: p.target_city })}
          />
        </Field>
        <Field label="Target date">
          <input
            type="date"
            className={inputCls}
            value={p.target_date ?? ""}
            onChange={(e) => set("target_date", e.target.value || null)}
            onBlur={() => save({ target_date: p.target_date })}
          />
        </Field>
        <Field label="Occupation">
          <input
            className={inputCls}
            value={p.occupation ?? ""}
            placeholder="What you do"
            onChange={(e) => set("occupation", e.target.value)}
            onBlur={() => save({ occupation: p.occupation })}
          />
        </Field>
        <Field label="Studies">
          <input
            className={inputCls}
            value={p.studies ?? ""}
            placeholder="School / degree"
            onChange={(e) => set("studies", e.target.value)}
            onBlur={() => save({ studies: p.studies })}
          />
        </Field>
        <Field label="Languages (comma-separated)">
          <input
            className={inputCls}
            defaultValue={langStr}
            placeholder="English, Spanish"
            onBlur={(e) => {
              const langs = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              set("languages", langs);
              save({ languages: langs });
            }}
          />
        </Field>
      </div>

      <Field label="Residency / visa status" className="mt-3">
        <input
          className={inputCls}
          value={p.residency_status ?? ""}
          placeholder="e.g. EU citizen — no visa needed"
          onChange={(e) => set("residency_status", e.target.value)}
          onBlur={() => save({ residency_status: p.residency_status })}
        />
      </Field>

      <Field label="About me" className="mt-3">
        <textarea
          rows={4}
          className={`${inputCls} resize-y`}
          value={p.about ?? ""}
          placeholder="A short description of who you are and where you're headed…"
          onChange={(e) => set("about", e.target.value)}
          onBlur={() => save({ about: p.about })}
        />
      </Field>

      <KeyDatesEditor
        keyDates={p.key_dates}
        onChange={(kd) => set("key_dates", kd)}
        onCommit={(kd) => save({ key_dates: kd })}
      />
    </Panel>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}

function KeyDatesEditor({
  keyDates,
  onChange,
  onCommit,
}: {
  keyDates: KeyDate[];
  onChange: (kd: KeyDate[]) => void;
  onCommit: (kd: KeyDate[]) => void;
}) {
  function update(i: number, patch: Partial<KeyDate>) {
    onChange(keyDates.map((k, idx) => (idx === i ? { ...k, ...patch } : k)));
  }
  function remove(i: number) {
    const next = keyDates.filter((_, idx) => idx !== i);
    onChange(next);
    onCommit(next);
  }
  function add() {
    onChange([...keyDates, { label: "", date: "" }]);
  }

  return (
    <div className="mt-4">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-3">
        Key dates
      </div>
      <div className="flex flex-col gap-2">
        {keyDates.map((k, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={inputCls}
              value={k.label}
              placeholder="Renewal, deadline, anniversary…"
              onChange={(e) => update(i, { label: e.target.value })}
              onBlur={() => onCommit(keyDates)}
            />
            <input
              type="date"
              className={`${inputBase} w-40 shrink-0`}
              value={k.date}
              onChange={(e) => update(i, { date: e.target.value })}
              onBlur={() => onCommit(keyDates)}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove key date"
              className="shrink-0 text-ink-3 hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 rounded-[3px] border border-dashed border-white/[0.08] px-2.5 py-1.5 text-xs text-ink-3 hover:border-ember/30 hover:text-ember"
      >
        + Add key date
      </button>
    </div>
  );
}
